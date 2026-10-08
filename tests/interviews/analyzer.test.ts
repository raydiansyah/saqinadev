import { describe, expect, it } from "vitest";
import { en as engineEn } from "@/lib/interview/copy/en";
import { id as engineId } from "@/lib/interview/copy/id";
import { type Answers, EMPTY_ANSWERS } from "@/lib/interview/types";
import { createRuleBasedAnalyzer } from "@/lib/interviews/analyzer";
import { en } from "@/lib/interviews/copy/en";
import { id } from "@/lib/interviews/copy/id";
import {
  EMPTY_DETAILS,
  EMPTY_INTERVIEW,
  followUpsFor,
  type InterviewData,
  type ProjectDetails,
  visibleSteps,
} from "@/lib/interviews/model";
import { createRuleBasedRecommendationEngine } from "@/lib/recommendations/engine";

const analyzer = createRuleBasedAnalyzer(en, engineEn);

function data(
  answers: Partial<Answers> = {},
  details: Partial<ProjectDetails> = {},
  rest: Partial<InterviewData> = {},
): InterviewData {
  return {
    ...EMPTY_INTERVIEW,
    answers: { ...EMPTY_ANSWERS, ...answers },
    details: { ...EMPTY_DETAILS, ...details },
    ...rest,
  };
}

const restaurant = data(
  {
    projectType: "pos",
    projectDescription: "Saya ingin membuat POS untuk restoran kecil.",
    objective: "Manage sales and daily operations for a small restaurant.",
    audience: ["business-owners", "employees"],
    features: ["auth", "pos", "inventory", "reports"],
    databaseNeed: "yes",
    databaseChoice: "recommend",
    deployment: "saqina-vercel",
    developmentMode: "saqina",
  },
  {
    platforms: ["web"],
    authMethods: ["google", "email"],
    followUps: { tableManagement: "yes", multiOutlet: "no" },
    timeline: "months",
  },
);

describe("conditional questions", () => {
  it("asks marketplace questions only for marketplaces", () => {
    expect(followUpsFor("marketplace")).toContain("sellerAccounts");
    expect(followUpsFor("marketplace")).toContain("inPlatformPayments");
  });

  it("never asks a portfolio or company profile about sellers, inventory or payment", () => {
    for (const type of ["portfolio", "company-profile", "school-website"] as const) {
      expect(followUpsFor(type)).toEqual([]);
      expect(visibleSteps(data({ projectType: type }))).not.toContain("followups");
    }
  });
});

describe("analyzer", () => {
  it("derives confirmed requirements from user answers", () => {
    const result = analyzer.analyze(restaurant);
    expect(result.name).toBe("Restaurant POS");
    const keys = result.requirements.map((r) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "overview",
        "feature:auth",
        "feature:pos",
        "auth:methods",
        "rule:tableManagement",
      ]),
    );
    expect(result.requirements.find((r) => r.key === "auth:methods")?.description).toContain(
      "Google",
    );
    expect(result.requirements.find((r) => r.key === "feature:auth")?.status).toBe("confirmed");
  });

  it("reports an unanswered follow-up as unknown instead of guessing", () => {
    const result = analyzer.analyze(restaurant);
    const stock = result.openQuestions.find((q) => q.id === "followup:stockTracking");
    expect(stock?.step).toBe("followups");
    expect(result.requirements.find((r) => r.key === "open:followup:stockTracking")?.status).toBe(
      "unknown",
    );
    expect(result.counts.unknown).toBeGreaterThan(0);
  });

  it("flags an undefined payment approach for transactional projects", () => {
    const result = analyzer.analyze(data({ projectType: "marketplace", features: ["auth"] }));
    expect(result.openQuestions.map((q) => q.id)).toContain("payment");
  });

  it("detects mobile-only platform with web deployment and never picks a side", () => {
    const conflicted = data({ deployment: "saqina-vercel" }, { platforms: ["mobile"] });
    const result = analyzer.analyze(conflicted);
    const conflict = result.conflicts.find((c) => c.id === "platform-deploy");
    expect(conflict?.options.map((o) => o.id)).toEqual(["mobile", "web", "both"]);
    expect(result.counts.conflicting).toBe(1);

    const both = conflict?.options.find((o) => o.id === "both")?.apply(conflicted);
    expect(both?.details.platforms).toEqual(["web", "mobile"]);
    expect(analyzer.analyze(both as InterviewData).conflicts).toHaveLength(0);

    // Keeping mobile is a valid answer too: the conflict is resolved, not re-raised.
    const mobile = conflict?.options.find((o) => o.id === "mobile")?.apply(conflicted);
    expect(analyzer.analyze(mobile as InterviewData).conflicts).toHaveLength(0);
  });

  it("marks inferred answers as inferred and offers them as assumptions", () => {
    const inferred = data(
      {
        projectType: "pos",
        features: ["pos", "inventory"],
        projectDescription: "Kasir untuk kafe",
      },
      {},
      { sources: { projectType: "inferred", features: "inferred" } },
    );
    const result = analyzer.analyze(inferred);
    expect(result.assumptions.map((a) => a.id)).toEqual(
      expect.arrayContaining(["projectType", "features"]),
    );
    expect(result.requirements.find((r) => r.key === "feature:pos")?.status).toBe("inferred");
  });

  it("infers role-based access from owners and staff", () => {
    const result = analyzer.analyze(restaurant);
    expect(result.assumptions.map((a) => a.key)).toContain("rbac");
    expect(result.requirements.find((r) => r.key === "feature:rbac")?.status).toBe("inferred");
  });

  it("detects database and sign-in contradictions", () => {
    const result = analyzer.analyze(
      data({ features: ["auth", "crud"], databaseNeed: "no" }, { authMethods: ["none"] }),
    );
    expect(result.conflicts.map((c) => c.id)).toEqual(
      expect.arrayContaining(["no-database", "auth-none"]),
    );
  });

  it("keeps open questions the user chose to leave unresolved, marked as kept", () => {
    const result = analyzer.analyze({ ...restaurant, keptUnresolved: ["followup:stockTracking"] });
    expect(result.openQuestions.find((q) => q.id === "followup:stockTracking")?.kept).toBe(true);
  });

  it("writes Indonesian requirements for Indonesian projects", () => {
    const result = createRuleBasedAnalyzer(id, engineId).analyze(restaurant);
    expect(result.name).toBe("POS Restoran");
    expect(result.requirements.find((r) => r.key === "auth:methods")?.description).toContain(
      "Pengguna login",
    );
  });
});

describe("recommendation engine", () => {
  const engine = createRuleBasedRecommendationEngine(en, engineEn);

  it("explains every recommendation with a reason and confidence", () => {
    const { items } = engine.recommend(restaurant);
    const keys = items.map((i) => i.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "application",
        "database",
        "deployment",
        "authentication",
        "architecture",
        "build_strategy",
      ]),
    );
    for (const item of items) {
      expect(item.reason.length).toBeGreaterThan(10);
      expect(["high", "medium", "low"]).toContain(item.confidence);
    }
    expect(items.find((i) => i.key === "authentication")?.source).toBe("user");
  });

  it("applies a user override and marks it as the user's", () => {
    const { items } = engine.recommend({ ...restaurant, overrides: { database: "MySQL" } });
    const db = items.find((i) => i.key === "database");
    expect(db).toMatchObject({ value: "MySQL", source: "user", confidence: "high" });
  });

  it("recommends at most one primary and two supporting landing concepts", () => {
    const landing = engine.recommend(restaurant).items.find((i) => i.key === "landing");
    expect(landing?.ids?.length).toBeGreaterThanOrEqual(1);
    expect(landing?.ids?.length).toBeLessThanOrEqual(3);
  });
});

describe("project copy", () => {
  it("has no em dashes", () => {
    for (const copy of [en, id]) expect(JSON.stringify(copy)).not.toContain("—");
  });
});
