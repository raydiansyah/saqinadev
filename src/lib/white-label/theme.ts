import type { CSSProperties } from "react";
import { readableOn } from "./contrast";

/** CSS variables that recolour the portal with the brand accent; none without one. */
export function brandStyle(accent: string | null | undefined): CSSProperties | undefined {
  if (!accent) return undefined;
  return {
    "--primary": accent,
    "--primary-foreground": readableOn(accent),
    "--ring": accent,
  } as CSSProperties;
}
