import { describe, expect, it } from "vitest";
import { LANDING_CONCEPTS } from "@/content/landing-concepts";
import { PROJECT_TYPES } from "@/lib/interview/options";
import { normalizeSelection, recommendLanding } from "@/lib/interview/rules/landing";
import { answers } from "./fixtures";

describe("recommendLanding", () => {
  it("has exactly 18 concepts", () => {
    expect(LANDING_CONCEPTS).toHaveLength(18);
  });

  it("never exceeds 1 primary + 2 supporting for any project type", () => {
    for (const projectType of PROJECT_TYPES) {
      const rec = recommendLanding(
        answers({ projectType, features: ["auth", "payment", "api", "integration", "ai"] }),
      );
      if (!rec) continue;
      expect(rec.supporting.length).toBeLessThanOrEqual(2);
      expect(rec.supporting).not.toContain(rec.primary);
      expect(rec.reason.length).toBeGreaterThan(0);
    }
  });

  it("recommends the SaaS mapping", () => {
    const rec = recommendLanding(
      answers({ projectType: "saas", features: ["auth", "dashboard", "payment"] }),
    );
    expect(rec?.primary).toBe("product-led");
    expect(rec?.supporting).toEqual(["dashboard-journey", "interactive-demo"]);
  });

  it("uses 3D only for physical products", () => {
    const plain = recommendLanding(answers({ projectType: "saas", features: ["auth", "payment"] }));
    expect([plain?.primary, ...(plain?.supporting ?? [])]).not.toContain("product-3d");
    const physical = recommendLanding(
      answers({
        projectType: "ecommerce",
        projectDescription: "Configurator for custom furniture",
      }),
    );
    expect(physical?.primary).toBe("product-3d");
    expect(physical?.supporting).toEqual(["pinned-stage", "cinematic-scroll"]);
  });

  it("returns nothing for products without a public landing page", () => {
    expect(recommendLanding(answers({ projectType: "internal-dashboard" }))).toBeNull();
  });

  it("enforces limits on user overrides", () => {
    expect(
      normalizeSelection({
        primary: "system-map",
        supporting: ["system-map", "product-led", "product-led", "motion-system", "before-after"],
      }),
    ).toEqual({ primary: "system-map", supporting: ["product-led", "motion-system"] });
  });
});
