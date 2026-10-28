import { describe, expect, it } from "vitest";
import { THEME_TOKENS, themeChart, themeStatus, UI_THEMES } from "@/content/ui-themes";

/** WCAG 2.1 relative luminance and contrast ratio for #rrggbb colours. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(UI_THEMES)("theme %s contrast (WCAG 2.1 AA)", (id) => {
  const t = THEME_TOKENS[id];

  it("uses plain #rrggbb colours", () => {
    for (const color of [
      t.background,
      t.surface,
      t.foreground,
      t.mutedForeground,
      t.border,
      t.primary,
      t.primaryForeground,
      t.accent,
    ])
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("keeps body text at 4.5:1 on the page and on surfaces", () => {
    expect(ratio(t.foreground, t.background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t.foreground, t.surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t.mutedForeground, t.background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t.mutedForeground, t.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps button text at 4.5:1 and the button itself at 3:1 against the page", () => {
    expect(ratio(t.primaryForeground, t.primary)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t.primary, t.background)).toBeGreaterThanOrEqual(3);
  });
});

describe.each(UI_THEMES)("theme %s dashboard colours", (id) => {
  const t = THEME_TOKENS[id];

  it("keeps status colours readable as text on the page and on surfaces (4.5:1)", () => {
    for (const color of Object.values(themeStatus(id))) {
      expect(ratio(color, t.background), color).toBeGreaterThanOrEqual(4.5);
      expect(ratio(color, t.surface), color).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps every chart series visible on the surface (3:1) and distinct", () => {
    const chart = themeChart(id);
    expect(chart.length).toBeGreaterThanOrEqual(3);
    expect(new Set(chart).size).toBe(chart.length);
    for (const color of chart) expect(ratio(color, t.surface), color).toBeGreaterThanOrEqual(3);
  });
});
