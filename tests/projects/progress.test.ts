import { describe, expect, it } from "vitest";
import {
  EMPTY_TASK_COUNTS,
  getNextProjectAction,
  type ProjectSnapshot,
  pipelineStages,
} from "@/lib/projects/progress";

const snapshot = (patch: Partial<ProjectSnapshot> = {}): ProjectSnapshot => ({
  slug: "restaurant-pos-k3x9",
  status: "planning",
  interviewStatus: "completed",
  unknownRequirements: 0,
  conflictingRequirements: 0,
  prdStatus: "draft",
  tasks: { ...EMPTY_TASK_COUNTS, todo: 4, backlog: 6 },
  ...patch,
});

describe("next action", () => {
  it.each([
    [{ interviewStatus: "in_progress" as const }, "continueInterview"],
    [{ tasks: { ...EMPTY_TASK_COUNTS, blocked: 1, todo: 2 } }, "resolveBlocker"],
    [{ conflictingRequirements: 1 }, "resolveConflicts"],
    [{ unknownRequirements: 2 }, "resolveOpenQuestions"],
    [{}, "reviewPrd"],
    [{ prdStatus: "approved" as const }, "startFirstTask"],
    [{ prdStatus: "approved" as const, tasks: { ...EMPTY_TASK_COUNTS } }, "reviewPlan"],
    [
      { prdStatus: "approved" as const, tasks: { ...EMPTY_TASK_COUNTS, review: 1, todo: 1 } },
      "reviewWork",
    ],
    [
      { prdStatus: "approved" as const, tasks: { ...EMPTY_TASK_COUNTS, done: 1, todo: 1 } },
      "continueBuilding",
    ],
    [{ status: "archived" as const }, "restoreProject"],
  ])("%o → %s", (patch, kind) => {
    expect(getNextProjectAction(snapshot(patch)).kind).toBe(kind);
  });

  it("resolves the interview before anything else, even with blocked tasks", () => {
    const s = snapshot({
      interviewStatus: "in_progress",
      tasks: { ...EMPTY_TASK_COUNTS, blocked: 3 },
    });
    expect(getNextProjectAction(s).path).toBe("/interview");
  });
});

describe("pipeline stages", () => {
  it("starts at understanding while the interview runs", () => {
    const s = pipelineStages(snapshot({ interviewStatus: "in_progress", prdStatus: null }));
    expect(s.understand).toBe("current");
    expect(s.requirements).toBe("upcoming");
  });

  it("moves to planning once requirements exist without conflicts", () => {
    const s = pipelineStages(snapshot());
    expect(s).toMatchObject({ understand: "done", requirements: "done", planning: "current" });
  });

  it("stays on requirements while conflicts remain", () => {
    expect(pipelineStages(snapshot({ conflictingRequirements: 1 })).requirements).toBe("current");
  });

  it("has exactly one current stage and never claims deployment", () => {
    for (const patch of [
      {},
      { prdStatus: "approved" as const },
      {
        prdStatus: "approved" as const,
        tasks: { ...EMPTY_TASK_COUNTS, review: 1, in_progress: 1 },
      },
    ]) {
      const s = pipelineStages(snapshot(patch));
      expect(Object.values(s).filter((v) => v === "current")).toHaveLength(1);
      expect(s.deploy).toBe("upcoming");
    }
  });
});
