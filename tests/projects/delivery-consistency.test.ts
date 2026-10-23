import { describe, expect, it } from "vitest";
import { NO_ANSWERS, planTaskAdjustment, settleAnswers } from "@/lib/delivery/consistency";

describe("settling an answer", () => {
  it("deployed means reviewed and built", () => {
    expect(settleAnswers(NO_ANSWERS, "deploy", true)).toEqual({
      build: true,
      review: true,
      deploy: true,
    });
  });

  it("reviewed means built, and leaves deploy alone", () => {
    expect(settleAnswers(NO_ANSWERS, "review", true)).toEqual({
      build: true,
      review: true,
      deploy: null,
    });
  });

  it("not built clears what was answered after it, and leaves the unanswered alone", () => {
    const live = { build: true, review: true, deploy: true };
    expect(settleAnswers(live, "build", false)).toEqual({
      build: false,
      review: false,
      deploy: false,
    });
    expect(settleAnswers({ build: true, review: null, deploy: null }, "build", false)).toEqual({
      build: false,
      review: null,
      deploy: null,
    });
  });

  it("not reviewed clears deploy only", () => {
    expect(settleAnswers({ build: true, review: true, deploy: true }, "review", false)).toEqual({
      build: true,
      review: false,
      deploy: false,
    });
  });
});

describe("what the answers do to the plan", () => {
  const counts = { total: 10, done: 3, review: 2, open: 5 };

  it("reviewed: every task that is not done becomes done", () => {
    expect(planTaskAdjustment({ build: true, review: true, deploy: null }, counts)).toEqual({
      toReview: 0,
      toDone: 7,
    });
  });

  it("built only: the open tasks wait for review", () => {
    expect(planTaskAdjustment({ build: true, review: false, deploy: null }, counts)).toEqual({
      toReview: 5,
      toDone: 0,
    });
  });

  it("not built: nothing moves, and no answer never moves a task back", () => {
    expect(planTaskAdjustment({ build: false, review: null, deploy: null }, counts)).toEqual({
      toReview: 0,
      toDone: 0,
    });
    expect(planTaskAdjustment(NO_ANSWERS, counts)).toEqual({ toReview: 0, toDone: 0 });
  });
});
