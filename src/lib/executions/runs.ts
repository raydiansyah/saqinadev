import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { assignAgentTx } from "@/lib/agents/orchestrator";
import { lockRun, meta, recordRunEvent, transition } from "@/lib/agents/run-core";
import type { ProjectAccess } from "@/lib/auth/permissions";
import type { Tx } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import type { EventBatch } from "@/lib/events/emitter";
import type { ExecutionRow, TaskRow } from "./types";

/**
 * Gives a task to an agent through the same assignment and run records the rest of Saqina uses,
 * so the run page, the activity feed and the audit trail show execution work too. `attempt`
 * is the number of this try; a retry gets a new run and keeps the old one as history.
 */
export async function assignForExecution(
  tx: Tx,
  access: ProjectAccess,
  execution: ExecutionRow,
  task: TaskRow,
  agentId: string,
  attempt: number,
  batch: EventBatch,
): Promise<{ runId: string; assignmentId: string }> {
  const ids = await assignAgentTx(
    tx,
    access,
    {
      taskId: task.id,
      agentId,
      instructions: `Execution ${execution.id.slice(0, 8)}: ${task.title}`,
    },
    { via: "agent", conversationId: execution.conversationId },
    batch,
  );
  await tx
    .update(agentRuns)
    .set({ executionId: execution.id, attempt })
    .where(and(eq(agentRuns.id, ids.runId), eq(agentRuns.projectId, execution.projectId)));
  return ids;
}

/** The newest run of a task in this execution. */
export async function latestRun(tx: Tx, task: TaskRow) {
  const [run] = await tx
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.taskId, task.id), eq(agentRuns.projectId, task.projectId)))
    .orderBy(desc(agentRuns.createdAt))
    .limit(1);
  return run ?? null;
}

/** queued → running for the run behind a task. A run that is no longer queued is left alone. */
export async function beginRun(
  tx: Tx,
  access: ProjectAccess,
  runId: string,
  batch: EventBatch,
): Promise<void> {
  const { run, agent, taskTitle } = await lockRun(tx, access, runId);
  if (run.status !== "queued") return;
  const next = await transition(tx, run, "running");
  await recordRunEvent(tx, next, "AGENT_STARTED", meta(agent, taskTitle), access.actor.id, batch);
}

const RUN_EVENT = {
  completed: "AGENT_COMPLETED",
  failed: "AGENT_FAILED",
  cancelled: "AGENT_CANCELLED",
} as const;

/** Ends a run that is still open. A run already final is not touched again. */
export async function endRun(
  tx: Tx,
  access: ProjectAccess,
  runId: string,
  to: "completed" | "failed" | "cancelled",
  data: { output?: Record<string, unknown>; error?: string } = {},
  batch: EventBatch,
): Promise<void> {
  const locked = await lockRun(tx, access, runId);
  const { agent, taskTitle } = locked;
  let run = locked.run;
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") return;
  // A queued run cannot finish: it starts first, so the record shows it ran.
  if (run.status === "queued" && to !== "cancelled") run = await transition(tx, run, "running");
  const next = await transition(tx, run, to, {
    ...(data.output ? { output: data.output } : {}),
    ...(data.error ? { error: data.error } : {}),
  });
  await recordRunEvent(tx, next, RUN_EVENT[to], meta(agent, taskTitle), access.actor.id, batch);
}
