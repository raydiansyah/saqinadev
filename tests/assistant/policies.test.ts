import { describe, expect, it } from "vitest";
import { applyEdits, executionMode } from "@/lib/assistant/actions/policies";
import { type PlannedAction, plannedActions, summarizeRisk } from "@/lib/assistant/actions/types";

const id = "4f0c8a9e-2b1d-4c3e-9f8a-1b2c3d4e5f60";
const task: PlannedAction = {
  type: "CREATE_TASK",
  key: "t1",
  payload: {
    title: "Print receipts",
    description: "",
    priority: "medium",
    status: "todo",
    milestoneId: null,
  },
};
const remove: PlannedAction = {
  type: "DELETE_TASK",
  key: "d1",
  payload: { id },
  before: { title: "Old", status: "todo" },
};
const assign: PlannedAction = {
  type: "ASSIGN_AGENT",
  key: "a1",
  optional: true,
  skip: false,
  payload: { task: { step: "t1" }, agentId: id, instructions: "" },
};

describe("execution policy", () => {
  it("runs a single low-risk write right away", () => {
    expect(executionMode([task], "auto_low_risk", "editor")).toBe("auto");
  });

  it("always asks for destructive, agent and requirement changes", () => {
    expect(executionMode([remove], "auto_low_risk", "owner")).toBe("proposal");
    expect(executionMode([task, assign], "auto_low_risk", "owner")).toBe("proposal");
  });

  it("asks for everything when the project says so, and never lets viewers write", () => {
    expect(executionMode([task], "always", "owner")).toBe("proposal");
    expect(executionMode([task], "auto_low_risk", "viewer")).toBe("forbidden");
  });

  it("treats a large batch of low-risk writes as a plan to review", () => {
    const many = [1, 2, 3].map((n) => ({ ...task, key: `t${n}` }));
    expect(executionMode(many, "auto_low_risk", "owner")).toBe("proposal");
  });

  it("labels a plan by its most serious action", () => {
    expect(summarizeRisk([task, remove])).toEqual({ category: "destructive", risk: "high" });
    expect(summarizeRisk([task, assign])).toEqual({ category: "agent", risk: "medium" });
  });
});

describe("proposal edits", () => {
  it("applies only whitelisted fields", () => {
    const edited = plannedActions.parse(
      applyEdits([task, assign], {
        t1: { title: "Print kitchen receipts", status: "done", priority: "high" },
        a1: { skip: true, agentId: id },
      }),
    );
    expect(edited[0].payload).toMatchObject({
      title: "Print kitchen receipts",
      status: "todo",
      priority: "high",
    });
    expect(edited[1]).toMatchObject({ skip: true });
  });

  it("cannot retarget a delete", () => {
    const [edited] = applyEdits([remove], { d1: { id: "00000000-0000-4000-8000-000000000000" } });
    expect((edited as PlannedAction).payload).toMatchObject({ id });
  });

  it("rejects invalid edited values on re-validation", () => {
    expect(plannedActions.safeParse(applyEdits([task], { t1: { title: "" } })).success).toBe(false);
  });
});
