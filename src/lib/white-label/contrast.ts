/**
 * Colour checks for a brand accent (WCAG 2.1). The portal is a dark surface and the accent is
 * used as a button fill and a focus ring, so two things must hold: the accent stands out from
 * the page (3:1, the bar for UI components) and some text colour reads on it (4.5:1).
 */

export const PAGE_BACKGROUND = "#171513";
const WHITE = "#ffffff";
const NEAR_BLACK = "#12100e";

export const HEX = /^#[0-9a-f]{6}$/i;

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The text colour with the better contrast on this fill. */
export function readableOn(fill: string): string {
  return contrastRatio(fill, WHITE) >= contrastRatio(fill, NEAR_BLACK) ? WHITE : NEAR_BLACK;
}

export type AccentVerdict = "ok" | "invalid" | "lowOnPage" | "lowText";

export function checkAccent(hex: string): AccentVerdict {
  if (!HEX.test(hex)) return "invalid";
  if (contrastRatio(hex, PAGE_BACKGROUND) < 3) return "lowOnPage";
  if (contrastRatio(hex, readableOn(hex)) < 4.5) return "lowText";
  return "ok";
}
