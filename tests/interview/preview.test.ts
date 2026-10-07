import { describe, expect, it } from "vitest";
import { CONCEPT_CATEGORIES, LANDING_CONCEPTS } from "@/content/landing-concepts";
import { findProfile } from "@/lib/interview/profiles";
import { getInsights } from "@/lib/interview/rules/insights";
import { recommendLanding } from "@/lib/interview/rules/landing";
import { answersFromIdea, previewProject } from "@/lib/interview/rules/preview";
import { recommend } from "@/lib/interview/rules/recommend";
import { answers } from "./fixtures";

describe("profiles", () => {
  it("reads common ideas into believable projects", () => {
    expect(findProfile("Build a POS for a small restaurant")?.id).toBe("restaurant-pos");
    expect(findProfile("a school management platform")?.id).toBe("school-management");
    // Indonesian ideas map to the same profiles.
    expect(findProfile("Aplikasi kasir untuk restoran kecil")?.id).toBe("restaurant-pos");
    expect(findProfile("Sistem informasi sekolah untuk guru dan orang tua")?.id).toBe(
      "school-management",
    );
    expect(findProfile("")).toBeUndefined();
  });
});

describe("previewProject", () => {
  it("marks engine guesses as suggested and never writes them into answers", () => {
    const a = answers({ projectDescription: "Build a POS for a small restaurant" });
    const preview = previewProject(a);
    expect(preview.label).toBe("Restaurant POS");
    expect(preview.users).toEqual({ items: ["Owner", "Manager", "Cashier"], suggested: true });
    expect(a.features).toEqual([]);
  });

  it("prefers the user's own answers", () => {
    const preview = previewProject(
      answers({ projectType: "pos", audience: ["employees"], features: ["inventory"] }),
    );
    expect(preview.users).toEqual({ items: ["Employees"], suggested: false });
    expect(preview.core).toEqual({ items: ["Inventory"], suggested: false });
    expect(preview.complexity).not.toBeNull();
  });

  it("drops a profile that contradicts the chosen type", () => {
    const preview = previewProject(
      answers({ projectType: "portfolio", projectDescription: "restaurant" }),
    );
    expect(preview.label).toBe("Portfolio");
  });
});

describe("answersFromIdea", () => {
  it("builds a recommendation input for the landing demo", () => {
    const a = answersFromIdea("Build a POS for a small restaurant", answers());
    expect(a.projectType).toBe("pos");
    expect(a.features).toEqual(expect.arrayContaining(["pos", "inventory", "rbac"]));
    // Matches the master prompt example: a small restaurant POS is built in Saqina Dev.
    expect(recommend(a).development.value).toBe("saqina");
  });
});

describe("business management insight", () => {
  it("turns a company profile with business modules into a web app suggestion", () => {
    const a = answers({
      projectType: "company-profile",
      audience: ["employees"],
      features: ["auth", "inventory", "payment", "rbac"],
    });
    const insight = getInsights(a).find((i) => i.id === "content-site-app-features");
    expect(insight?.message).toContain("Company Website + Employee Portal + Inventory + Payment");
    expect(insight?.message).toContain("Continue with this structure?");
  });

  it("keeps a lighter suggestion for a site with only a login", () => {
    const a = answers({ projectType: "company-profile", features: ["auth"] });
    expect(getInsights(a)[0].actions[0].label).toContain("Company Website + Customer Portal");
  });
});

describe("landing mapping", () => {
  it.each([
    ["saas", "product-led"],
    ["ai-application", "file-to-result"],
    ["portfolio", "cinematic-scroll"],
    ["company-profile", "conversion-minimal"],
  ] as const)("%s leads with %s", (projectType, primary) => {
    expect(
      recommendLanding(answers({ projectType, features: ["auth", "dashboard"] }))?.primary,
    ).toBe(primary);
  });

  it("puts every concept in exactly one category", () => {
    const all = CONCEPT_CATEGORIES.flatMap((c) => [...c.concepts]);
    expect(all).toHaveLength(18);
    expect(new Set(all)).toEqual(new Set(LANDING_CONCEPTS));
  });
});

describe("business app landing", () => {
  it("treats an accepted business app like a workflow product", () => {
    const rec = recommendLanding(
      answers({
        projectType: "company-profile",
        structure: "business-app",
        features: ["auth", "inventory", "payment", "rbac"],
      }),
    );
    expect(rec?.primary).toBe("product-led");
  });
});

describe("project name", () => {
  it("is the same in the live stage, the review and the brief", () => {
    const a = answers({
      projectType: "pos",
      projectDescription: "Build a POS for a small restaurant",
    });
    expect(previewProject(a).label).toBe("Restaurant POS");
    expect(recommend(a).projectLabel).toBe("Restaurant POS");
    expect(recommend(a).slug).toBe("restaurant-pos");
  });

  it("does not invent a name from the type alone", () => {
    expect(previewProject(answers({ projectType: "pos" })).label).toBe("POS / Cashier");
  });
});
