import { describe, expect, it } from "vitest";
import {
  answersContradict,
  deliveryNotes,
  NO_ANSWERS,
  planTaskAdjustment,
} from "@/lib/delivery/consistency";

const answer = (step: "build" | "review" | "deploy", done: boolean) => ({
  step,
  done,
  unanswered: false,
});
const noTasks = { total: 0, done: 0, review: 0, open: 0 };

describe("answers that disagree", () => {
  it("reviewed but not built is a contradiction, flagged on review", () => {
    expect(answersContradict({ build: false, review: true, deploy: null })).toBe(true);
    expect(answersContradict({ build: null, review: true, deploy: null })).toBe(true);
    expect(deliveryNotes([answer("review", true)], noTasks)).toContainEqual({
      step: "review",
      code: "needs_build",
    });
  });

  it("deployed before build and review are both yes is a contradiction", () => {
    expect(answersContradict({ build: true, review: false, deploy: true })).toBe(true);
    expect(deliveryNotes([answer("build", true), answer("deploy", true)], noTasks)).toContainEqual({
      step: "deploy",
      code: "needs_build_and_review",
    });
  });

  it("consistent answers, or none, are not a contradiction", () => {
    expect(answersContradict(NO_ANSWERS)).toBe(false);
    expect(answersContradict({ build: true, review: null, deploy: null })).toBe(false);
    expect(answersContradict({ build: true, review: true, deploy: true })).toBe(false);
    expect(answersContradict({ build: false, review: false, deploy: false })).toBe(false);
    expect(deliveryNotes([answer("build", true), answer("review", true)], noTasks)).toEqual([]);
  });
});

describe("what one answer does to the plan", () => {
  const counts = { total: 10, done: 3, review: 2, open: 5 };

  it("reviewed: every task that is not done becomes done", () => {
    expect(planTaskAdjustment("review", true, counts)).toEqual({ toReview: 0, toDone: 7 });
  });

  it("built: the open tasks wait for review", () => {
    expect(planTaskAdjustment("build", true, counts)).toEqual({ toReview: 5, toDone: 0 });
  });

  it("not yet, or a deploy answer, moves nothing, and never moves a task back", () => {
    expect(planTaskAdjustment("build", false, counts)).toEqual({ toReview: 0, toDone: 0 });
    expect(planTaskAdjustment("review", false, counts)).toEqual({ toReview: 0, toDone: 0 });
    expect(planTaskAdjustment("deploy", true, counts)).toEqual({ toReview: 0, toDone: 0 });
  });
});
