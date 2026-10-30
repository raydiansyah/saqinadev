import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  agentMessages,
  agentRuns,
  agents,
  executionArtifacts,
  executions,
  taskDependencies,
  tasks,
} from "@/lib/db/schema";
import type { AgentLiveStatus, ExecutionTaskStatus } from "@/lib/domain/executions";
import { AppError } from "@/lib/errors";
import { type ExecutionSnapshotDTO, toExecutionDTO } from "./dto";
import { latestEvents } from "./events";
import { definitionsOf } from "./snapshot";
import { liveStatus } from "./state";

export interface TaskView {
  id: string;
  title: string;
  description: string;
  phase: string | null;
  roleKey: string | null;
  status: ExecutionTaskStatus;
  blockedReason: string | null;
  priority: string;
  acceptanceCriteria: string[];
  targetPaths: string[];
  planVersion: number | null;
  parentTaskId: string | null;
  dependsOn: string[];
  /** The agent that has the task now or had it last. Null until the dispatcher hands it out. */
  agentId: string | null;
  /** Who will take it: the agent of its role. Only used to show a waiting agent as waiting. */
  plannedAgentId: string | null;
  attempts: number;
}

export interface AgentView {
  id: string;
  name: string;
  role: string;
  definitionKey: string | null;
  status: AgentLiveStatus;
  taskId: string | null;
  taskTitle: string | null;
}

/**
 * Everything the Studio shows about one execution, read from one place. The agents' status is
 * worked out from the status of their tasks; progress counts tasks that really finished.
 */
export async function getExecutionView(actor: Actor, slug: string, executionId: string) {
  if (!z.uuid().safeParse(executionId).success) throw new AppError("NOT_FOUND");
  const access = await loadProjectAccess(actor, { slug }, "project:read");
  const [execution] = await db
    .select()
    .from(executions)
    .where(and(eq(executions.id, executionId), eq(executions.projectId, access.project.id)));
  if (!execution) throw new AppError("NOT_FOUND");

  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.executionId, execution.id))
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
  const ids = rows.map((t) => t.id);
  const [edges, runs, messages, artifacts] = await Promise.all([
    ids.length
      ? db.select().from(taskDependencies).where(inArray(taskDependencies.taskId, ids))
      : [],
    db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.executionId, execution.id))
      .orderBy(asc(agentRuns.createdAt)),
    db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.executionId, execution.id))
      .orderBy(desc(agentMessages.createdAt))
      .limit(100),
    db
      .select()
      .from(executionArtifacts)
      .where(eq(executionArtifacts.executionId, execution.id))
      .orderBy(desc(executionArtifacts.createdAt))
      .limit(200),
  ]);
  const team = await db.select().from(agents).where(eq(agents.projectId, access.project.id));
  const frozen = definitionsOf(execution);

  const agentOf = new Map<string, string>(); // task id -> agent id of its newest run
  const tries = new Map<string, number>();
  for (const run of runs) {
    if (run.taskId) {
      agentOf.set(run.taskId, run.agentId);
      tries.set(run.taskId, (tries.get(run.taskId) ?? 0) + 1);
    }
  }
  const roleAgent = new Map<string, string>();
  for (const member of [...team]
    .filter((a) => a.status !== "disabled" && a.definitionId && frozen[a.definitionId])
    .sort(
      (a, b) =>
        (frozen[b.definitionId as string]?.priority ?? 0) -
        (frozen[a.definitionId as string]?.priority ?? 0),
    ))
    if (!roleAgent.has(member.role)) roleAgent.set(member.role, member.id);
  const taskViews: TaskView[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    phase: t.phase,
    roleKey: t.roleKey,
    status: t.executionStatus ?? "pending",
    blockedReason: t.blockedReason,
    priority: t.priority,
    acceptanceCriteria: t.acceptanceCriteria,
    targetPaths: t.targetPaths,
    planVersion: t.planVersion,
    parentTaskId: t.parentTaskId,
    dependsOn: edges.filter((e) => e.taskId === t.id).map((e) => e.dependsOnId),
    agentId: agentOf.get(t.id) ?? null,
    plannedAgentId: agentOf.get(t.id) ?? (t.roleKey ? (roleAgent.get(t.roleKey) ?? null) : null),
    attempts: tries.get(t.id) ?? 0,
  }));

  const involved = new Set(taskViews.flatMap((t) => (t.plannedAgentId ? [t.plannedAgentId] : [])));
  const agentViews: AgentView[] = team
    .filter((a) => a.definitionId && frozen[a.definitionId])
    .map((a) => {
      const mine = taskViews.filter(
        (t) => t.plannedAgentId === a.id && t.planVersion === execution.planVersion,
      );
      const current = mine.find((t) =>
        ["running", "reviewing", "waiting_approval", "blocked", "queued"].includes(t.status),
      );
      return {
        id: a.id,
        name: a.name,
        role: a.role,
        definitionKey: a.definitionId ? frozen[a.definitionId].key : null,
        // An agent with nothing assigned in this version of the plan is idle, whatever it did before.
        status: involved.has(a.id) ? liveStatus(mine.map((t) => t.status)) : "idle",
        taskId: current?.id ?? null,
        taskTitle: current?.title ?? null,
      };
    });
  // Progress is about the plan as it stands now; an older version of the plan is history.
  // The planning task is how the plan got made, not part of what the plan builds, so it is not counted.
  const counted = taskViews.filter(
    (t) =>
      t.planVersion === execution.planVersion && t.phase !== "plan" && t.status !== "cancelled",
  );
  return {
    execution,
    tasks: taskViews,
    agents: agentViews,
    messages: messages.reverse(),
    artifacts,
    /** Finished tasks out of all tasks of this plan. Not an estimate. */
    progress: {
      done: counted.filter((t) => t.status === "succeeded").length,
      total: counted.length,
    },
    lastSeq: execution.seq,
  };
}

export type ExecutionViewModel = Awaited<ReturnType<typeof getExecutionView>>;

/** The execution as the browser takes it: the view and the latest events, as plain JSON. */
export async function getExecutionSnapshot(actor: Actor, slug: string, executionId: string) {
  const view = await getExecutionView(actor, slug, executionId);
  const events = await latestEvents(
    db,
    { executionId: view.execution.id, projectId: view.execution.projectId },
    100,
  );
  return {
    execution: toExecutionDTO(view),
    events: events.map((e) => ({
      seq: e.seq,
      type: e.type,
      payload: e.payload,
      createdAt: e.createdAt.toISOString(),
    })),
  } satisfies ExecutionSnapshotDTO;
}
