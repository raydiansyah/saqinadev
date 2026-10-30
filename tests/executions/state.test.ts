import { describe, expect, it } from "vitest";
import { EXECUTION_STATUSES, EXECUTION_TASK_STATUSES } from "@/lib/domain/executions";
import {
  assertExecutionMove,
  assertTaskMove,
  canMoveExecution,
  canMoveTask,
  InvalidExecutionTransitionError,
  liveStatus,
  settleExecution,
} from "@/lib/executions/state";

describe("execution and task state machines", () => {
  it("never leaves a final state", () => {
    for (const to of EXECUTION_STATUSES) {
      expect(canMoveExecution("succeeded", to)).toBe(false);
      expect(canMoveExecution("cancelled", to)).toBe(false);
    }
    for (const to of EXECUTION_TASK_STATUSES) {
      expect(canMoveTask("succeeded", to)).toBe(false);
      expect(canMoveTask("cancelled", to)).toBe(false);
    }
  });

  it("does not let an old event move a succeeded task back to running", () => {
    expect(() => assertTaskMove("succeeded", "running")).toThrow(InvalidExecutionTransitionError);
    expect(() => assertExecutionMove("succeeded", "running")).toThrow(
      InvalidExecutionTransitionError,
    );
  });

  it("lets a failed task or execution be retried, and only that", () => {
    expect(canMoveTask("failed", "queued")).toBe(true);
    expect(canMoveTask("failed", "succeeded")).toBe(false);
    expect(canMoveExecution("failed", "running")).toBe(true);
  });

  it("cancels through cancelling, so a worker still running is not reported as stopped", () => {
    expect(canMoveExecution("running", "cancelling")).toBe(true);
    expect(canMoveExecution("running", "cancelled")).toBe(false);
    expect(canMoveExecution("cancelling", "cancelled")).toBe(true);
    expect(canMoveExecution("cancelling", "running")).toBe(false);
  });

  it("only starts a task from the queue", () => {
    expect(canMoveTask("pending", "running")).toBe(false);
    expect(canMoveTask("queued", "running")).toBe(true);
  });
});

describe("liveStatus", () => {
  it("is idle with no tasks", () => {
    expect(liveStatus([])).toBe("idle");
  });

  it("shows the most urgent state of its tasks", () => {
    expect(liveStatus(["succeeded", "running", "queued"])).toBe("running");
    expect(liveStatus(["queued", "blocked"])).toBe("blocked");
    expect(liveStatus(["failed", "succeeded"])).toBe("failed");
    expect(liveStatus(["succeeded", "succeeded"])).toBe("succeeded");
    expect(liveStatus(["cancelled"])).toBe("cancelled");
    expect(liveStatus(["pending", "succeeded"])).toBe("waiting_agent");
    expect(liveStatus(["pending", "queued"])).toBe("queued");
  });
});

describe("settleExecution", () => {
  it("stays open while any task is open", () => {
    expect(settleExecution(["succeeded", "running"])).toBe("open");
    expect(settleExecution([])).toBe("open");
  });

  it("succeeds only when every task succeeded", () => {
    expect(settleExecution(["succeeded", "succeeded"])).toBe("succeeded");
    expect(settleExecution(["succeeded", "failed"])).toBe("failed");
    expect(settleExecution(["succeeded", "cancelled"])).toBe("failed");
  });
});
