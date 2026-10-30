import "server-only";
import { and, count, eq, inArray } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { agentRuns, executions, taskDependencies, tasks } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { accessFor } from "./access";
import { cancelIdleTasks, settleCancellation } from "./cancel";
import { pickRunnable, type RunnableTask, readyTasks, unreachableTasks } from "./graph";
import { enqueueJob } from "./jobs";
import { moveExecution, moveTask } from "./lifecycle";
import { postMessage } from "./messages";
import { assignForExecution } from "./runs";
import { executionTeam, type TeamMember } from "./snapshot";
import { OPEN_TASK_STATUSES, settleExecution } from "./state";
import { type ExecutionRow, scopeOf, type TaskRow } from "./types";

const FINAL = ["succeeded", "failed", "cancelled"];
/** Tasks that take a place in the execution's parallel limit. */
const OCCUPYING = ["queued", "running", "reviewing", "waiting_approval"];

const party = (m: TeamMember) => ({
  id: m.agent.id,
  definitionKey: m.definition.key,
  handoffTargets: m.definition.handoffTargets,
});

/** Agents of this role that can take the task now, the least busy first. */
function candidates(team: TeamMember[], role: string | null, load: Map<string, number>) {
  return team
    .filter((m) => m.definition.role === role)
    .sort(
      (a, b) =>
        (load.get(a.agent.id) ?? 0) - (load.get(b.agent.id) ?? 0) ||
        b.definition.priority - a.definition.priority,
    );
}

async function assignTo(
  tx: Tx,
  access: ProjectAccess,
  execution: ExecutionRow,
  task: TaskRow,
  options: TeamMember[],
  attempt: number,
  batch: EventBatch,
): Promise<TeamMember | null> {
  for (const member of options) {
    try {
      await assignForExecution(tx, access, execution, task, member.agent.id, attempt, batch);
      return member;
    } catch (error) {
      // The Owner switched this kind of agent off after the execution began: try the next one.
      if (error instanceof AppError && error.code === "VALIDATION_ERROR") continue;
      throw error;
    }
  }
  return null;
}

/**
 * One dispatch round. It starts what is ready and allowed, blocks what can no longer run, stops
 * new work when a cancellation or the deadline asks for it, and ends the execution when every
 * task is final. It reads task states and nothing else: a task is done when its state says so.
 */
export async function runDispatchJob(executionId: string): Promise<void> {
  const [first] = await db.select().from(executions).where(eq(executions.id, executionId));
  if (!first || FINAL.includes(first.status)) return;
  if (
    first.status !== "running" &&
    first.status !== "waiting_approval" &&
    first.status !== "cancelling"
  )
    return;
  let access: ProjectAccess;
  try {
    access = await accessFor(first);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(executions)
        .where(eq(executions.id, executionId))
        .for("update");
      if (row && !FINAL.includes(row.status) && row.status !== "cancelling")
        await moveExecution(tx, row, "failed", { reason: "access_lost" });
    });
    return;
  }
  const batch = new EventBatch();
  await db.transaction(async (tx) => {
    const [execution] = await tx
      .select()
      .from(executions)
      .where(eq(executions.id, executionId))
      .for("update");
    if (!execution || FINAL.includes(execution.status)) return;

    if (execution.status === "cancelling" || execution.cancelRequestedAt) {
      await cancelIdleTasks(tx, access, execution, "cancelled_by_user", batch);
      await settleCancellation(tx, execution);
      return;
    }
    const startedAt = execution.startedAt?.getTime() ?? Date.now();
    if (Date.now() - startedAt > execution.budget.maxMinutes * 60_000) {
      await cancelIdleTasks(tx, access, execution, "deadline", batch);
      await moveExecution(tx, execution, "failed", { reason: "deadline" });
      return;
    }

    const rows = await tx.select().from(tasks).where(eq(tasks.executionId, execution.id));
    const edges = await tx
      .select()
      .from(taskDependencies)
      .where(
        inArray(
          taskDependencies.taskId,
          rows.map((t) => t.id),
        ),
      );
    const nodes: Array<RunnableTask & { row: TaskRow }> = rows.map((row) => ({
      key: row.id,
      status: row.executionStatus ?? "pending",
      dependsOn: edges.filter((e) => e.taskId === row.id).map((e) => e.dependsOnId),
      paths: row.targetPaths,
      row,
    }));
    const byId = new Map(nodes.map((n) => [n.key, n]));

    // Work behind a failed, cancelled or blocked task cannot run; say so instead of leaving it pending.
    // Run again after assigning: a task blocked in this round holds back what waits for it too.
    const blockUnreachable = async () => {
      for (const dead of unreachableTasks([...byId.values()])) {
        const task = byId.get(dead.key)?.row;
        if (!task || task.executionStatus === "blocked") continue;
        const moved = await moveTask(tx, task, "blocked", { reason: "dependency_failed" });
        await postMessage(tx, scopeOf(execution), {
          taskId: moved.id,
          from: null,
          to: null,
          type: "blocker",
          body: `${moved.title} cannot start: a task it depends on did not finish.`,
          key: `blocker:${moved.id}:dependency`,
        });
        byId.set(dead.key, {
          ...(byId.get(dead.key) as (typeof nodes)[number]),
          status: "blocked",
          row: moved,
        });
      }
    };
    await blockUnreachable();

    const live = [...byId.values()];
    const occupying = live.filter((n) => OCCUPYING.includes(n.status));
    const ready = readyTasks(live).filter((t) => t.status === "pending");
    const { start, held } = pickRunnable(
      ready,
      occupying,
      execution.budget.maxParallel - occupying.length,
    );

    const team = await executionTeam(tx, execution);
    const load = new Map<string, number>();
    const open = await tx
      .select({ agentId: agentRuns.agentId, n: count() })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.executionId, execution.id),
          inArray(agentRuns.status, ["queued", "running", "waiting"]),
        ),
      )
      .groupBy(agentRuns.agentId);
    for (const o of open) load.set(o.agentId, o.n);

    for (const candidate of start) {
      const task = byId.get(candidate.key)?.row as TaskRow;
      const [{ n: tries }] = await tx
        .select({ n: count() })
        .from(agentRuns)
        .where(eq(agentRuns.taskId, task.id));
      const attempt = tries + 1;
      const member = await assignTo(
        tx,
        access,
        execution,
        task,
        candidates(team, task.roleKey, load),
        attempt,
        batch,
      );
      if (!member) {
        const moved = await moveTask(tx, task, "blocked", { reason: `no_agent:${task.roleKey}` });
        await postMessage(tx, scopeOf(execution), {
          taskId: moved.id,
          from: null,
          to: null,
          type: "blocker",
          body: `No agent is available for the role "${task.roleKey}". Switch one on in the agent registry, then retry the task.`,
          key: `blocker:${moved.id}:no_agent:${attempt}`,
        });
        continue;
      }
      load.set(member.agent.id, (load.get(member.agent.id) ?? 0) + 1);
      const queued = await moveTask(tx, task, "queued", { agentId: member.agent.id });
      const needed = byId.get(candidate.key)?.dependsOn ?? [];
      await postMessage(tx, scopeOf(execution), {
        taskId: queued.id,
        from: null,
        to: { id: member.agent.id, definitionKey: member.definition.key },
        type: needed.length > 0 ? "dependency_ready" : "assignment",
        body:
          needed.length > 0
            ? `${queued.title}: the tasks it needed are done. Their results are attached.`
            : `${queued.title}: assigned to ${member.definition.name}.`,
        artifactRefs: [...needed],
        key: `assign:${queued.id}:${attempt}`,
      });
      await enqueueJob(tx, {
        ...scopeOf(execution),
        kind: "run_task",
        taskId: queued.id,
        key: `run:${queued.id}:${attempt}`,
      });
    }

    for (const { task, behind } of held)
      await postMessage(tx, scopeOf(execution), {
        taskId: task.key,
        from: null,
        to: null,
        type: "conflict",
        body: `Held back: it writes the same files as another running task (${behind}). It starts when that one is done.`,
        key: `conflict:${task.key}:${behind}`,
      });

    // Whatever the assignments just blocked holds back its dependents.
    for (const n of byId.values())
      if (start.some((st) => st.key === n.key)) {
        const [fresh] = await tx.select().from(tasks).where(eq(tasks.id, n.key));
        if (fresh) byId.set(n.key, { ...n, status: fresh.executionStatus ?? n.status, row: fresh });
      }
    await blockUnreachable();
    await settle(tx, execution);
  });
  batch.flush();
}

/** Ends the execution when its tasks say it is over, and keeps its waiting state honest. */
async function settle(tx: Tx, execution: ExecutionRow): Promise<void> {
  const statuses = (
    await tx
      .select({ s: tasks.executionStatus })
      .from(tasks)
      .where(eq(tasks.executionId, execution.id))
  ).flatMap((r) => (r.s ? [r.s] : []));
  const verdict = settleExecution(statuses);
  if (verdict === "succeeded") await moveExecution(tx, execution, "succeeded");
  else if (verdict === "failed")
    await moveExecution(tx, execution, "failed", { reason: "tasks_failed" });
  else {
    const moving = statuses.some((s) => s === "queued" || s === "running" || s === "reviewing");
    const asking = statuses.includes("waiting_approval");
    const open = statuses.filter((s) => OPEN_TASK_STATUSES.includes(s));
    // Everything still open is blocked: nothing will move on its own. Stop and say why; a retry resumes.
    if (!moving && !asking && open.length > 0 && open.every((s) => s === "blocked"))
      await moveExecution(tx, execution, "failed", {
        reason: statuses.includes("failed") ? "tasks_failed" : "blocked",
      });
    else if (execution.status === "running" && asking && !moving)
      await moveExecution(tx, execution, "waiting_approval");
    else if (execution.status === "waiting_approval" && moving)
      await moveExecution(tx, execution, "running");
  }
}
