import { describe, expect, it } from "vitest";
import {
  isTheme,
  THEME_CATEGORIES,
  THEME_TIER,
  THEME_TOKENS,
  UI_THEMES,
} from "@/content/ui-themes";
import { createRuleBasedEngine } from "@/lib/interview/engine";
import { PROJECT_TYPES } from "@/lib/interview/options";
import { hasDataScreens, recommendTheme } from "@/lib/interview/rules/theme";
import { isStepVisible } from "@/lib/interview/rules/visibility";
import { saveAnswersInput } from "@/lib/interviews/validators";
import { answers } from "./fixtures";

describe("ui themes", () => {
  it("has exactly 21 themes, each with a tier and tokens", () => {
    expect(UI_THEMES).toHaveLength(21);
    for (const id of UI_THEMES) {
      expect(THEME_TIER[id], id).toBeDefined();
      expect(THEME_TOKENS[id], id).toBeDefined();
    }
  });

  it("puts every theme in exactly one category", () => {
    const all = THEME_CATEGORIES.flatMap((c) => [...c.themes]);
    expect(all).toHaveLength(21);
    expect(new Set(all)).toEqual(new Set(UI_THEMES));
  });

  it("recognises only known ids", () => {
    expect(isTheme("modern-dark")).toBe(true);
    expect(isTheme("comic-sans")).toBe(false);
  });
});

describe("recommendTheme", () => {
  it("never recommends a concept theme on its own", () => {
    for (const projectType of PROJECT_TYPES) {
      const rec = recommendTheme(answers({ projectType }));
      if (!rec) continue;
      for (const id of [rec.primary, ...rec.alternatives])
        expect(THEME_TIER[id], `${projectType}: ${id}`).not.toBe("concept");
      expect(rec.reason.length).toBeGreaterThan(0);
      expect(rec.overridden).toBe(false);
    }
  });

  it("returns nothing before the project is known", () => {
    expect(recommendTheme(answers({}))).toBeNull();
  });

  it("has no interface to style for a mobile backend", () => {
    expect(recommendTheme(answers({ projectType: "mobile-backend" }))).toBeNull();
    expect(isStepVisible("theme", answers({ projectType: "mobile-backend" }))).toBe(false);
    expect(isStepVisible("theme", answers({ projectType: "saas" }))).toBe(true);
  });

  it("follows the user's choice, even a concept theme, and keeps the suggestion", () => {
    const rec = recommendTheme(answers({ projectType: "saas", theme: "cyberpunk" }));
    expect(rec?.primary).toBe("cyberpunk");
    expect(rec?.overridden).toBe(true);
    expect(rec?.alternatives).toContain("modern-dark");
    expect(rec?.alternatives).not.toContain("cyberpunk");
  });

  it("is not an override when the user picks the suggestion", () => {
    const rec = recommendTheme(answers({ projectType: "saas", theme: "modern-dark" }));
    expect(rec?.primary).toBe("modern-dark");
    expect(rec?.overridden).toBe(false);
  });

  it("flows through the engine in both languages", () => {
    for (const locale of ["en", "id"] as const) {
      const engine = createRuleBasedEngine(locale);
      const rec = engine.recommend(answers({ projectType: "company-profile" }));
      expect(rec.theme?.primary).toBe("professional");
      expect(engine.copy.themes[rec.theme?.primary ?? "professional"].name).toBe("Professional");
      expect(engine.brief(rec)).toContain("Professional");
      expect(engine.preview(answers({ projectType: "company-profile" })).theme?.primary).toBe(
        "professional",
      );
    }
  });
});

describe("theme answers at the boundary", () => {
  const base = { slug: "demo", step: "theme" as const };

  it("accepts a known theme and null (back to the recommendation)", () => {
    expect(saveAnswersInput.safeParse({ ...base, patch: { theme: "sketch" } }).success).toBe(true);
    expect(saveAnswersInput.safeParse({ ...base, patch: { theme: null } }).success).toBe(true);
  });

  it("rejects an unknown theme", () => {
    expect(saveAnswersInput.safeParse({ ...base, patch: { theme: "comic-sans" } }).success).toBe(
      false,
    );
  });
});

describe("hasDataScreens", () => {
  it("is true for dashboards, reports and analytics, false otherwise", () => {
    expect(hasDataScreens(answers({ projectType: "internal-dashboard" }))).toBe(true);
    expect(hasDataScreens(answers({ projectType: "saas", features: ["reports"] }))).toBe(true);
    expect(hasDataScreens(answers({ projectType: "portfolio", features: ["auth"] }))).toBe(false);
  });
});
