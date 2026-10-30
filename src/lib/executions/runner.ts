import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db, type Executor } from "@/lib/db/client";
import {
  agentMessages,
  agentRuns,
  agents,
  executionArtifacts,
  executions,
  taskDependencies,
  tasks,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { log } from "@/lib/log";
import { accessFor } from "./access";
import { cancelBusyTask, settleCancellation } from "./cancel";
import {
  type Concluding,
  concludeFailed,
  concludeReviewFailed,
  concludeSucceeded,
  safeError,
  storeArtifacts,
} from "./conclude";
import { enqueueDispatch, type JobRow } from "./jobs";
import { moveTask } from "./lifecycle";
import { beginRun, latestRun } from "./runs";
import { executionTeam, type TeamMember } from "./snapshot";
import type { EngineOptions, TaskExecutor, TaskInput, TaskResult } from "./task-executor";
import { type ExecutionRow, scopeOf, type TaskRow } from "./types";

const FINAL = ["succeeded", "failed", "cancelled"];
const CANCEL_POLL_MS = 3000;

/** Used when nothing is plugged in: the task fails with a plain reason instead of pretending to work. */
const unavailable: TaskExecutor = async () => ({
  outcome: "failed",
  error: "executor_unavailable",
  retryable: false,
});

interface Started {
  execution: ExecutionRow;
  task: TaskRow;
  member: TeamMember;
  team: TeamMember[];
  runId: string;
  attempt: number;
  input: Pick<TaskInput, "inputs" | "messages" | "previousError">;
}

async function gather(
  tx: Executor,
  task: TaskRow,
  execution: ExecutionRow,
): Promise<Started["input"]> {
  const edges = await tx
    .select()
    .from(taskDependencies)
    .where(eq(taskDependencies.taskId, task.id));
  const ids = edges.map((e) => e.dependsOnId);
  const deps = ids.length ? await tx.select().from(tasks).where(inArray(tasks.id, ids)) : [];
  const done = ids.length
    ? await tx
        .select()
        .from(agentMessages)
        .where(
          and(
            eq(agentMessages.executionId, execution.id),
            eq(agentMessages.type, "completion"),
            inArray(agentMessages.taskId, ids),
          ),
        )
    : [];
  const made = ids.length
    ? await tx
        .select()
        .from(executionArtifacts)
        .where(
          and(
            eq(executionArtifacts.executionId, execution.id),
            inArray(executionArtifacts.taskId, ids),
          ),
        )
    : [];
  const notes = await tx
    .select({ type: agentMessages.type, body: agentMessages.body, from: agents.name })
    .from(agentMessages)
    .leftJoin(agents, eq(agents.id, agentMessages.fromAgentId))
    .where(
      and(
        eq(agentMessages.executionId, execution.id),
        eq(agentMessages.taskId, task.id),
        inArray(agentMessages.type, ["review_feedback", "decision", "info_request"]),
      ),
    )
    .orderBy(desc(agentMessages.createdAt))
    .limit(10);
  const [last] = await tx
    .select({ error: agentRuns.error })
    .from(agentRuns)
    .where(and(eq(agentRuns.taskId, task.id), eq(agentRuns.status, "failed")))
    .orderBy(desc(agentRuns.createdAt))
    .limit(1);
  return {
    inputs: deps.map((d) => ({
      taskId: d.id,
      title: d.title,
      role: d.roleKey,
      summary: done.find((m) => m.taskId === d.id)?.body ?? "",
      artifacts: made
        .filter((a) => a.taskId === d.id)
        .map((a) => ({ kind: a.kind, path: a.path, commitSha: a.commitSha, summary: a.summary })),
    })),
    messages: notes.reverse().map((n) => ({ type: n.type, from: n.from, body: n.body })),
    previousError: last?.error ?? null,
  };
}

/** Moves a queued task to running, or says why it will not run. Idempotent for a repeated job. */
async function begin(job: JobRow, access: ProjectAccess): Promise<Started | null> {
  const batch = new EventBatch();
  const started = await db.transaction(async (tx) => {
    const [execution] = await tx
      .select()
      .from(executions)
      .where(eq(executions.id, job.executionId))
      .for("update");
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, job.taskId as string), eq(tasks.executionId, job.executionId)))
      .for("update");
    if (!execution || !task || FINAL.includes(execution.status)) return null;
    const scope = scopeOf(execution);
    const team = await executionTeam(tx, execution);
    const run = await latestRun(tx, task);
    const member = team.find((m) => m.agent.id === run?.agentId);

    if (execution.status === "cancelling" || execution.cancelRequestedAt) {
      if (task.executionStatus === "queued")
        await cancelBusyTask(tx, access, task, "cancelled_by_user", batch);
      await settleCancellation(tx, execution);
      return null;
    }
    // A task still marked running when its job comes back means the worker died mid-task: that try failed.
    if (task.executionStatus === "running" && run && member) {
      await concludeFailed(
        { tx, access, execution, task, member, team, attempt: run.attempt, runId: run.id, batch },
        { outcome: "failed", error: "worker_lost", retryable: true },
      );
      return null;
    }
    if (task.executionStatus !== "queued") return null;
    if (!run || !member) {
      await moveTask(tx, task, "blocked", { reason: "no_agent" });
      await enqueueDispatch(tx, scope);
      return null;
    }
    await beginRun(tx, access, run.id, batch);
    const running = await moveTask(tx, task, "running", { agentId: member.agent.id });
    return {
      execution,
      task: running,
      member,
      team,
      runId: run.id,
      attempt: run.attempt,
      input: await gather(tx, running, execution),
    };
  });
  batch.flush();
  return started;
}

/** Runs the executor with the definition's time limit, and aborts it when a cancellation arrives. */
async function execute(
  s: Started,
  access: ProjectAccess,
  options: EngineOptions,
): Promise<TaskResult> {
  const controller = new AbortController();
  const left =
    (s.execution.startedAt?.getTime() ?? Date.now()) +
    s.execution.budget.maxMinutes * 60_000 -
    Date.now();
  const limit = Math.max(1000, Math.min(s.member.definition.timeoutMs, left));
  const timer = setTimeout(() => controller.abort(new Error("timeout")), limit);
  const watch = setInterval(async () => {
    const [row] = await db
      .select({ at: executions.cancelRequestedAt })
      .from(executions)
      .where(eq(executions.id, s.execution.id));
    if (row?.at) controller.abort(new Error("cancelled"));
  }, CANCEL_POLL_MS);
  try {
    const run = options.taskExecutor ?? unavailable;
    return await run({
      execution: s.execution,
      task: s.task,
      agent: s.member.agent,
      definition: s.member.definition,
      access,
      attempt: s.attempt,
      signal: controller.signal,
      provider: options.provider,
      ...s.input,
    });
  } catch (error) {
    const reason = controller.signal.aborted
      ? String((controller.signal.reason as Error)?.message)
      : null;
    if (!reason)
      log.error("execution.executor_threw", { executionId: s.execution.id, error: String(error) });
    return {
      outcome: "failed",
      error: reason ?? safeError(error),
      retryable: reason !== "cancelled",
    };
  } finally {
    clearTimeout(timer);
    clearInterval(watch);
  }
}

async function conclude(s: Started, access: ProjectAccess, result: TaskResult): Promise<void> {
  const batch = new EventBatch();
  await db.transaction(async (tx) => {
    const [execution] = await tx
      .select()
      .from(executions)
      .where(eq(executions.id, s.execution.id))
      .for("update");
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, s.task.id)).for("update");
    if (!execution || !task || task.executionStatus !== "running") return;
    const c: Concluding = {
      tx,
      access,
      execution,
      task,
      member: s.member,
      team: s.team,
      attempt: s.attempt,
      runId: s.runId,
      batch,
    };
    const stopped =
      FINAL.includes(execution.status) ||
      execution.status === "cancelling" ||
      execution.cancelRequestedAt;
    if (stopped) {
      // The result arrived after a stop. What really happened (a commit) is still recorded, the task is not finished.
      if (result.outcome === "succeeded") await storeArtifacts(c, result.artifacts);
      await cancelBusyTask(
        tx,
        access,
        task,
        execution.status === "failed" ? "execution_failed" : "cancelled_by_user",
        batch,
      );
      await settleCancellation(tx, execution);
      await enqueueDispatch(tx, scopeOf(execution));
      return;
    }
    if (result.outcome === "succeeded") await concludeSucceeded(c, result);
    else if (result.outcome === "review_failed") await concludeReviewFailed(c, result);
    else await concludeFailed(c, result);
  });
  batch.flush();
}

/** The `run_task` job: run one queued task with its agent, then record what really came of it. */
export async function runTaskJob(job: JobRow, options: EngineOptions = {}): Promise<void> {
  if (!job.taskId) return;
  const [execution] = await db.select().from(executions).where(eq(executions.id, job.executionId));
  if (!execution) return;
  let access: ProjectAccess;
  try {
    access = await accessFor(execution);
  } catch (error) {
    if (error instanceof AppError) return;
    throw error;
  }
  const started = await begin(job, access);
  if (!started) return;
  const result = await execute(started, access, options);
  await conclude(started, access, result);
}
