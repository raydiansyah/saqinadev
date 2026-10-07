import { describe, expect, it } from "vitest";
import {
  isStepComplete,
  nextStep,
  previousStep,
  visibleSteps,
} from "@/lib/interview/rules/visibility";
import { answers } from "./fixtures";

describe("visibleSteps", () => {
  it("skips database and versioning for a simple company profile", () => {
    const steps = visibleSteps(answers({ projectType: "company-profile", features: ["search"] }));
    expect(steps).not.toContain("database");
    expect(steps).not.toContain("versioning");
    expect(steps).toContain("landing");
  });

  it("asks about the database once a content site gains app features", () => {
    const steps = visibleSteps(answers({ projectType: "company-profile", features: ["auth"] }));
    expect(steps).toContain("database");
  });

  it("asks for the agent only when building with an external agent", () => {
    expect(visibleSteps(answers({ developmentMode: "saqina" }))).not.toContain("agent");
    expect(visibleSteps(answers({ developmentMode: "unsure" }))).not.toContain("agent");
    expect(visibleSteps(answers({ developmentMode: "external" }))).toContain("agent");
  });

  it("skips the landing page for internal tools", () => {
    expect(visibleSteps(answers({ projectType: "internal-dashboard" }))).not.toContain("landing");
  });
});

describe("isStepComplete", () => {
  it("accepts a type or a description on the first step", () => {
    expect(isStepComplete("project", answers())).toBe(false);
    expect(isStepComplete("project", answers({ projectType: "saas" }))).toBe(true);
    expect(isStepComplete("project", answers({ projectDescription: "A clinic booking app" }))).toBe(
      true,
    );
  });

  it("requires at least one stack field when the user has their own stack", () => {
    expect(isStepComplete("technology", answers({ techPreference: "own" }))).toBe(false);
    const ownStack = { ...answers().ownStack, frontend: "Vue" };
    expect(isStepComplete("technology", answers({ techPreference: "own", ownStack }))).toBe(true);
  });

  it("requires a database choice when a database is needed", () => {
    expect(isStepComplete("database", answers({ databaseNeed: "yes" }))).toBe(false);
    expect(
      isStepComplete("database", answers({ databaseNeed: "yes", databaseChoice: "mysql" })),
    ).toBe(true);
  });
});

describe("navigation", () => {
  const simple = answers({ projectType: "company-profile", features: ["search"] });

  it("jumps over hidden steps", () => {
    expect(nextStep("technology", simple)).toBe("development");
    expect(previousStep("development", simple)).toBe("technology");
  });

  it("returns to review after an edit unless a new step became required", () => {
    const filled = answers({
      projectType: "saas",
      developmentMode: "saqina",
      deployment: "unsure",
      versioning: "yes",
    });
    expect(nextStep("development", filled, true)).toBe("review");
    const external = { ...filled, developmentMode: "external" as const };
    expect(nextStep("development", external, true)).toBe("agent");
  });
});
