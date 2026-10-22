import { describe, expect, it } from "vitest";
import { evaluateSkill, renderSkill, skillContentSchema } from "@/lib/memory/skills/content";

const good = skillContentSchema.parse({
  name: "Prepare a deployment checklist",
  description: "Builds the checklist a release needs before it goes live.",
  useCase: "Before every production release.",
  triggers: ["a release is about to ship"],
  exclusions: ["a hotfix with a signed-off waiver"],
  prerequisites: ["a green build"],
  steps: [
    { title: "List what changed", detail: "Read the merged pull requests." },
    { title: "Check migrations", detail: "Confirm each one is reversible." },
  ],
  outputs: ["a checklist in the release document"],
  validation: ["every item has an owner and a tick"],
});

describe("skill evaluation", () => {
  it("scores a complete skill high and lists nothing wrong", () => {
    expect(evaluateSkill(good)).toMatchObject({ score: 100, issues: [], blocking: false });
  });

  it("marks a skill with no way to tell it worked as weak, not blocked", () => {
    const e = evaluateSkill({ ...good, validation: [], triggers: [], outputs: [] });
    expect(e.blocking).toBe(false);
    expect(e.issues).toEqual(
      expect.arrayContaining(["no_validation", "no_trigger", "no_expected_output"]),
    );
    expect(e.score).toBeLessThan(50);
  });

  it("blocks a single-step skill and one that carries a secret", () => {
    const one = evaluateSkill({ ...good, steps: [good.steps[0]] });
    expect(one).toMatchObject({ blocking: true });
    expect(one.issues).toContain("single_step");
    const leaked = evaluateSkill({
      ...good,
      steps: [
        ...good.steps,
        { title: "Deploy", detail: "use key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789" },
      ],
    });
    expect(leaked.blocking).toBe(true);
    expect(leaked.issues).toContain("contains_secret");
    expect(leaked.score).toBeLessThanOrEqual(20);
  });
});

describe("skill text", () => {
  it("renders when to use it, when not, steps in order and how to check", () => {
    const text = renderSkill(good);
    expect(text).toContain("Use when:\n- a release is about to ship");
    expect(text).toContain("Do not use when:\n- a hotfix with a signed-off waiver");
    expect(text.indexOf("1. List what changed")).toBeLessThan(text.indexOf("2. Check migrations"));
    expect(text).toContain("Check it worked:\n- every item has an owner and a tick");
  });

  it("refuses a skill without a name, a description or steps", () => {
    expect(skillContentSchema.safeParse({ ...good, name: "ab" }).success).toBe(false);
    expect(skillContentSchema.safeParse({ ...good, steps: [] }).success).toBe(false);
    expect(skillContentSchema.safeParse({ ...good, description: "short" }).success).toBe(false);
  });
});

describe("form fields", () => {
  it("turns lines into lists and steps into title and detail", async () => {
    const { lines, parseSteps, stepsText } = await import("@/lib/memory/skills/form");
    expect(lines(" a \n\n b\n")).toEqual(["a", "b"]);
    const steps = parseSteps("Build: run the build\nShip\nCheck: open: the site");
    expect(steps).toEqual([
      { title: "Build", detail: "run the build" },
      { title: "Ship", detail: "" },
      { title: "Check", detail: "open: the site" },
    ]);
    expect(parseSteps(stepsText(steps))).toEqual(steps);
  });
});
