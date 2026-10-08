import type { RunStatus } from "@/lib/domain/enums";

/**
 * Agent run lifecycle. Pure and UI-agnostic: notifications, activity, monitoring or any
 * future visual layer read the same states.
 *
 *   queued → running → waiting | blocked | failed | completed | cancelled
 *   queued ↔ paused,  failed → queued (retry),  waiting → running | completed
 */
const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["running", "paused", "cancelled"],
  paused: ["queued", "cancelled"],
  running: ["waiting", "blocked", "failed", "completed", "cancelled"],
  waiting: ["running", "completed", "blocked", "failed", "cancelled"],
  blocked: ["queued", "cancelled"],
  failed: ["queued", "cancelled"],
  completed: [],
  cancelled: [],
};

export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = ["completed", "failed", "cancelled"];
export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ["queued", "running", "waiting", "paused"];

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: RunStatus,
    readonly to: RunStatus,
  ) {
    super(`Cannot move an agent run from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Which user controls make sense for a run in this state. */
export function availableControls(status: RunStatus) {
  return {
    cancel: canTransition(status, "cancelled"),
    retry: status === "failed" || status === "blocked",
    pause: status === "queued",
    resume: status === "paused",
    reassign:
      status === "failed" || status === "blocked" || status === "queued" || status === "paused",
  };
}
