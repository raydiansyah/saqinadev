import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import type { Tx } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import type { ExecutionTaskStatus } from "@/lib/domain/executions";
import type { EventBatch } from "@/lib/events/emitter";
import { moveExecution, moveTask } from "./lifecycle";
import { endRun, latestRun } from "./runs";
import type { ExecutionRow, TaskRow } from "./types";

/** Tasks nobody is working on right now: they can stop at once. */
const IDLE: ExecutionTaskStatus[] = ["pending", "queued", "blocked", "waiting_agent"];
/** Tasks a worker may still be running. They stop when the worker comes back and sees the flag. */
const BUSY: ExecutionTaskStatus[] = ["running", "reviewing", "waiting_approval"];

async function cancelTask(
  tx: Tx,
  access: ProjectAccess,
  task: TaskRow,
  reason: string,
  batch: EventBatch,
) {
  const run = await latestRun(tx, task);
  if (run) await endRun(tx, access, run.id, "cancelled", {}, batch);
  await moveTask(tx, task, "cancelled", { reason, agentId: run?.agentId ?? null });
}

/** Cancels every task that is not running. Returns how many were. */
export async function cancelIdleTasks(
  tx: Tx,
  access: ProjectAccess,
  execution: ExecutionRow,
  reason: string,
  batch: EventBatch,
): Promise<number> {
  const rows = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.executionId, execution.id), inArray(tasks.executionStatus, IDLE)));
  for (const task of rows) await cancelTask(tx, access, task, reason, batch);
  return rows.length;
}

/** Cancels one task that a worker has just given back (its result is dropped). */
export const cancelBusyTask = cancelTask;

/**
 * Finishes a cancellation once nothing is running any more. Until then the execution stays
 * `cancelling`: we do not say a task stopped while a worker still holds it.
 */
export async function settleCancellation(tx: Tx, execution: ExecutionRow): Promise<ExecutionRow> {
  if (execution.status !== "cancelling") return execution;
  const busy = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.executionId, execution.id), inArray(tasks.executionStatus, BUSY)))
    .limit(1);
  if (busy.length > 0) return execution;
  return moveExecution(tx, execution, "cancelled", { reason: "cancelled_by_user" });
}
