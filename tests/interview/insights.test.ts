import { describe, expect, it } from "vitest";
import { getInsights } from "@/lib/interview/rules/insights";
import { answers } from "./fixtures";

const ids = (a: Parameters<typeof getInsights>[0]) => getInsights(a).map((i) => i.id);

describe("getInsights", () => {
  it("detects a company profile that is really a web application", () => {
    const a = answers({
      projectType: "company-profile",
      features: ["auth", "inventory", "payment"],
    });
    const insight = getInsights(a).find((i) => i.id === "content-site-app-features");
    expect(insight?.message).toContain("Business Management Web App");
    const accepted = insight?.actions[0].apply(a);
    expect(accepted?.structure).toBe("business-app");
    expect(ids(accepted ?? a)).not.toContain("content-site-app-features");
  });

  it("warns when data features have no database", () => {
    expect(ids(answers({ projectType: "pos", databaseNeed: "no" }))).toContain(
      "data-without-database",
    );
    expect(ids(answers({ projectType: "portfolio", databaseNeed: "no" }))).not.toContain(
      "data-without-database",
    );
  });

  it("suggests roles instead of multi-tenant on a portfolio", () => {
    const a = answers({ projectType: "portfolio", features: ["multi-tenant"] });
    const insight = getInsights(a).find((i) => i.id === "content-site-multi-tenant");
    expect(insight?.actions[0].apply(a).features).toEqual(["rbac"]);
  });

  it("never changes answers on its own and respects dismissals", () => {
    const a = answers({ projectType: "pos", databaseNeed: "no" });
    const dismissed = getInsights(a)[0].actions[1].apply(a);
    expect(dismissed.databaseNeed).toBe("no");
    expect(ids(dismissed)).not.toContain("data-without-database");
  });
});
