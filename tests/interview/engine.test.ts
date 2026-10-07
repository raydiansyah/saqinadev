import { describe, expect, it } from "vitest";
import { toMarkdownBrief } from "@/lib/interview/brief";
import { classify } from "@/lib/interview/classify";
import { createRuleBasedEngine } from "@/lib/interview/engine";
import { createReducer, INITIAL_STATE } from "@/lib/interview/state";
import { parseState } from "@/lib/interview/storage";
import { answers } from "./fixtures";

const engine = createRuleBasedEngine();

describe("classify", () => {
  it("reads project type, features and roles from free text", () => {
    const c = classify("A school website where teachers upload grades and students log in");
    expect(c.projectType).toBe("school-website");
    expect(c.features).toEqual(expect.arrayContaining(["auth", "file-upload"]));
    expect(c.audience).toEqual(expect.arrayContaining(["teachers", "students"]));
    expect(c.physical).toBe(false);
  });

  it("returns nothing for empty input", () => {
    expect(classify("  ")).toEqual({ features: [], audience: [], physical: false });
  });
});

describe("recommend", () => {
  it("keeps a simple company profile simple", () => {
    const rec = engine.recommend(answers({ projectType: "company-profile", features: ["search"] }));
    expect(rec.complexity.level).toBe("low");
    expect(rec.database.value).toBe("Not required");
    expect(rec.versioning).toBeNull();
    expect(rec.development.value).toBe("saqina");
  });

  it("recommends an agent for existing code and respects explicit choices", () => {
    const rec = engine.recommend(answers({ projectType: "saas", projectState: "existing" }));
    expect(rec.development.value).toBe("external");
    expect(rec.development.chosen).toBe(false);
    const chosen = engine.recommend(answers({ developmentMode: "external", agent: "kiro" }));
    expect(chosen.agent).toMatchObject({ value: "Kiro", chosen: true });
  });

  it("suggests features only when asked", () => {
    const rec = engine.recommend(answers({ projectType: "pos", featuresUnknown: true }));
    expect(rec.features.suggested).toContain("inventory");
    expect(rec.features.selected).toEqual([]);
  });

  it("renders a Markdown brief", () => {
    const md = toMarkdownBrief(
      engine.recommend(answers({ projectType: "saas", objective: "Bill teams" })),
    );
    expect(md).toMatch(/^# SaaS/);
    expect(md).toContain("## Landing page");
    expect(md).not.toContain("—");
  });
});

describe("reducer", () => {
  const reduce = createReducer(engine);

  it("does not advance past an incomplete step", () => {
    expect(reduce(INITIAL_STATE, { type: "next" }).step).toBe("project");
  });

  it("edits from review and comes back", () => {
    const atReview = {
      ...INITIAL_STATE,
      answers: answers({ projectType: "saas", audience: ["customers"] }),
      step: "review" as const,
    };
    const editing = reduce(atReview, { type: "edit", step: "audience" });
    expect(editing).toMatchObject({ step: "audience", returnToReview: true });
    expect(reduce(editing, { type: "back" }).step).toBe("review");
  });

  it("clears acceptance when answers change", () => {
    const accepted = reduce(INITIAL_STATE, { type: "accept" });
    expect(reduce(accepted, { type: "update", patch: { objective: "x" } }).accepted).toBe(false);
  });
});

describe("parseState", () => {
  it("round-trips valid state and rejects garbage", () => {
    const state = { ...INITIAL_STATE, answers: answers({ projectType: "booking" }) };
    expect(parseState(JSON.stringify(state))).toEqual(state);
    expect(parseState("{not json")).toBeNull();
    expect(parseState(JSON.stringify({ ...state, step: "nope" }))).toBeNull();
    expect(
      parseState(JSON.stringify({ ...state, answers: { ...state.answers, features: ["hack"] } })),
    ).toBeNull();
  });
});
