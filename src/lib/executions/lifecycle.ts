import "server-only";
import { and, eq } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { executions, tasks } from "@/lib/db/schema";
import type { TaskStatus } from "@/lib/domain/enums";
import type {
  ExecutionEventType,
  ExecutionStatus,
  ExecutionTaskStatus,
} from "@/lib/domain/executions";
import { AppError } from "@/lib/errors";
import { appendEvent } from "./events";
import {
  assertExecutionMove,
  assertTaskMove,
  InvalidExecutionTransitionError,
  liveStatus,
} from "./state";
import { type ExecutionRow, scopeOf, type TaskRow } from "./types";

/** What a person sees on the Kanban board for the same work, kept in step with the execution. */
const KANBAN: Partial<Record<ExecutionTaskStatus, TaskStatus>> = {
  running: "in_progress",
  waiting_agent: "in_progress",
  waiting_approval: "in_progress",
  reviewing: "in_progress",
  succeeded: "done",
  failed: "blocked",
  blocked: "blocked",
  cancelled: "backlog",
};

const TASK_EVENT: Partial<Record<ExecutionTaskStatus, ExecutionEventType>> = {
  running: "task.started",
  succeeded: "task.completed",
  failed: "task.failed",
  blocked: "task.blocked",
  cancelled: "task.cancelled",
};

const conflict = (error: unknown): never => {
  if (error instanceof InvalidExecutionTransitionError)
    throw new AppError("CONFLICT", error.message);
  throw error;
};

/**
 * Moves a task of an execution to a new state. The rule table decides if the move is allowed, the
 * update only applies while the task is still in the state the caller saw (a second worker that
 * got there first makes this a CONFLICT, never a silent overwrite), and the matching events are
 * written in the same transaction.
 */
export async function moveTask(
  tx: Executor,
  task: TaskRow,
  to: ExecutionTaskStatus,
  options: {
    agentId?: string | null;
    reason?: string | null;
    patch?: Partial<typeof tasks.$inferInsert>;
    extra?: Record<string, unknown>;
  } = {},
): Promise<TaskRow> {
  const from = task.executionStatus;
  if (!task.executionId || !from)
    throw new AppError("CONFLICT", "Task is not part of an execution");
  try {
    assertTaskMove(from, to);
  } catch (error) {
    conflict(error);
  }
  const kanban = KANBAN[to];
  const [row] = await tx
    .update(tasks)
    .set({
      ...options.patch,
      executionStatus: to,
      blockedReason: to === "blocked" || to === "failed" ? (options.reason ?? null) : null,
      ...(kanban ? { status: kanban } : {}),
      ...(to === "succeeded" ? { completedAt: new Date() } : {}),
    })
    .where(and(eq(tasks.id, task.id), eq(tasks.executionStatus, from)))
    .returning();
  if (!row) throw new AppError("CONFLICT", "Task changed");
  const scope = { executionId: task.executionId, projectId: task.projectId };
  await appendEvent(tx, scope, TASK_EVENT[to] ?? "task.progress", {
    taskId: task.id,
    from,
    to,
    reason: options.reason ?? null,
    agentId: options.agentId ?? null,
    ...options.extra,
  });
  if (options.agentId)
    await appendEvent(tx, scope, "agent.status_changed", {
      agentId: options.agentId,
      taskId: task.id,
      status: liveStatus([to]),
    });
  return row;
}

const EXECUTION_EVENT: Partial<Record<ExecutionStatus, ExecutionEventType>> = {
  succeeded: "execution.completed",
  failed: "execution.failed",
  cancelled: "execution.cancelled",
};

/** Same guarantees as `moveTask`, for the execution as a whole. */
export async function moveExecution(
  tx: Executor,
  execution: ExecutionRow,
  to: ExecutionStatus,
  options: { reason?: string | null; patch?: Partial<typeof executions.$inferInsert> } = {},
): Promise<ExecutionRow> {
  const from = execution.status;
  try {
    assertExecutionMove(from, to);
  } catch (error) {
    conflict(error);
  }
  const now = new Date();
  const final = to === "succeeded" || to === "failed" || to === "cancelled";
  const [row] = await tx
    .update(executions)
    .set({
      ...options.patch,
      status: to,
      ...(to === "running" && !execution.startedAt ? { startedAt: now } : {}),
      ...(final ? { endedAt: now } : { endedAt: null }),
      ...(to === "failed" && options.reason ? { errorSummary: options.reason } : {}),
    })
    .where(and(eq(executions.id, execution.id), eq(executions.status, from)))
    .returning();
  if (!row) throw new AppError("CONFLICT", "Execution changed");
  const started =
    to === "running" && (from === "planning" || from === "planned" || from === "queued");
  await appendEvent(
    tx,
    scopeOf(execution),
    started ? "execution.started" : (EXECUTION_EVENT[to] ?? "execution.updated"),
    {
      from,
      to,
      reason: options.reason ?? null,
    },
  );
  return row;
}
