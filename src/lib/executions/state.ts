import type {
  AgentLiveStatus,
  ExecutionStatus,
  ExecutionTaskStatus,
} from "@/lib/domain/executions";

/**
 * Execution lifecycle. Pure: the service, the worker and the UI reducer all read the same rules.
 *
 *   queued → planning → planned | running → waiting_approval ↔ running → succeeded | failed
 *   any open state → cancelling → cancelled,   failed → running (retry of the failed tasks)
 *
 * `succeeded` and `cancelled` are final: a late or replayed event can never reopen them.
 */
const EXECUTION: Record<ExecutionStatus, readonly ExecutionStatus[]> = {
  queued: ["planning", "failed", "cancelling", "cancelled"],
  planning: ["planned", "running", "failed", "cancelling", "cancelled"],
  planned: ["running", "cancelling", "cancelled"],
  running: ["waiting_approval", "succeeded", "failed", "cancelling"],
  waiting_approval: ["running", "succeeded", "failed", "cancelling"],
  cancelling: ["cancelled"],
  failed: ["running"],
  succeeded: [],
  cancelled: [],
};

const TASK: Record<ExecutionTaskStatus, readonly ExecutionTaskStatus[]> = {
  pending: ["queued", "blocked", "cancelled"],
  queued: ["running", "blocked", "cancelled"],
  running: [
    "waiting_agent",
    "waiting_approval",
    "reviewing",
    "succeeded",
    "failed",
    "blocked",
    "cancelled",
  ],
  waiting_agent: ["running", "blocked", "failed", "cancelled"],
  waiting_approval: ["running", "succeeded", "failed", "cancelled"],
  reviewing: ["running", "succeeded", "failed", "cancelled"],
  blocked: ["pending", "queued", "failed", "cancelled"],
  failed: ["queued", "cancelled"],
  succeeded: [],
  cancelled: [],
};

export const TERMINAL_EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  "succeeded",
  "failed",
  "cancelled",
];
export const TERMINAL_TASK_STATUSES: readonly ExecutionTaskStatus[] = [
  "succeeded",
  "failed",
  "cancelled",
];
/** A task in one of these is still part of the work that has not finished. */
export const OPEN_TASK_STATUSES: readonly ExecutionTaskStatus[] = [
  "pending",
  "queued",
  "running",
  "waiting_agent",
  "waiting_approval",
  "blocked",
  "reviewing",
];

export const canMoveExecution = (from: ExecutionStatus, to: ExecutionStatus) =>
  EXECUTION[from].includes(to);
export const canMoveTask = (from: ExecutionTaskStatus, to: ExecutionTaskStatus) =>
  TASK[from].includes(to);

export class InvalidExecutionTransitionError extends Error {
  constructor(
    readonly kind: "execution" | "task",
    readonly from: string,
    readonly to: string,
  ) {
    super(`Cannot move an ${kind} from ${from} to ${to}`);
    this.name = "InvalidExecutionTransitionError";
  }
}

export function assertExecutionMove(from: ExecutionStatus, to: ExecutionStatus): void {
  if (!canMoveExecution(from, to)) throw new InvalidExecutionTransitionError("execution", from, to);
}

export function assertTaskMove(from: ExecutionTaskStatus, to: ExecutionTaskStatus): void {
  if (!canMoveTask(from, to)) throw new InvalidExecutionTransitionError("task", from, to);
}

/** Most urgent first: what the card of an agent says when it holds several tasks. */
const LIVE_ORDER: readonly AgentLiveStatus[] = [
  "running",
  "reviewing",
  "waiting_approval",
  "blocked",
  "queued",
  "waiting_agent",
  "failed",
  "succeeded",
];

/**
 * What an agent shows. It comes only from the status of the tasks assigned to it: no timer and
 * no stored copy that could drift from the tasks. A task still behind its dependencies counts as
 * the agent waiting for another agent.
 */
export function liveStatus(taskStatuses: readonly ExecutionTaskStatus[]): AgentLiveStatus {
  const seen = new Set<AgentLiveStatus>(
    taskStatuses.map((s) => (s === "pending" ? "waiting_agent" : s)),
  );
  for (const status of LIVE_ORDER) if (seen.has(status)) return status;
  if (taskStatuses.length > 0 && taskStatuses.every((s) => s === "cancelled")) return "cancelled";
  return "idle";
}

/**
 * Whether an execution is done, from its tasks. Needs every task final; one failed or cancelled
 * required task means the execution is not a success.
 */
export function settleExecution(
  taskStatuses: readonly ExecutionTaskStatus[],
): "succeeded" | "failed" | "open" {
  if (taskStatuses.length === 0) return "open";
  if (taskStatuses.some((s) => OPEN_TASK_STATUSES.includes(s))) return "open";
  return taskStatuses.every((s) => s === "succeeded") ? "succeeded" : "failed";
}
