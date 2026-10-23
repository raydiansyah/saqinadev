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

describe("the team's answers decide the last stages", () => {
  const delivery = (build: boolean | null, review: boolean | null, deploy: boolean | null) => ({
    build,
    review,
    deploy,
    awaiting: false,
  });
  const stages = (d: ReturnType<typeof delivery>) =>
    pipelineStages(snapshot({ delivery: d, prdStatus: "draft" }));

  it("an imported project that has not answered waits: no build stage reads as current", () => {
    const s = pipelineStages(
      snapshot({
        prdStatus: "approved",
        delivery: { build: null, review: null, deploy: null, awaiting: true },
      }),
    );
    expect([s.build, s.review, s.deploy]).toEqual(["upcoming", "upcoming", "upcoming"]);
    expect(
      getNextProjectAction(
        snapshot({ delivery: { build: null, review: null, deploy: null, awaiting: true } }),
      ).kind,
    ).toBe("confirmDelivery");
  });

  it("built but not reviewed: review is the current stage, and everything before is done", () => {
    expect(stages(delivery(true, false, false))).toEqual({
      understand: "done",
      requirements: "done",
      planning: "done",
      build: "done",
      review: "current",
      deploy: "upcoming",
    });
  });

  it("reviewed: deploy is current. Deployed: everything is done", () => {
    expect(stages(delivery(true, true, false)).deploy).toBe("current");
    const live = stages(delivery(true, true, true));
    expect(Object.values(live).every((v) => v === "done")).toBe(true);
  });

  it("not built yet: build is current even though planning was never approved", () => {
    const s = stages(delivery(false, null, null));
    expect([s.planning, s.build, s.review, s.deploy]).toEqual([
      "done",
      "current",
      "upcoming",
      "upcoming",
    ]);
  });
});

describe("the next action follows the team's answers", () => {
  const d = (build: boolean, review: boolean, deploy: boolean) => ({
    build,
    review,
    deploy,
    awaiting: false,
  });
  it.each([
    [d(true, false, false), "reviewWork"],
    [d(true, true, false), "deploySystem"],
    [d(true, true, true), "systemLive"],
  ])("%o → %s", (delivery, kind) => {
    expect(getNextProjectAction(snapshot({ delivery })).kind).toBe(kind);
  });

  it("a blocked task still comes first, and not built keeps the old order", () => {
    expect(
      getNextProjectAction(
        snapshot({ delivery: d(true, true, true), tasks: { ...EMPTY_TASK_COUNTS, blocked: 1 } }),
      ).kind,
    ).toBe("resolveBlocker");
    expect(getNextProjectAction(snapshot({ delivery: d(false, false, false) })).kind).toBe(
      "reviewPrd",
    );
  });
});
