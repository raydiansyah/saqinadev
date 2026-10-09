import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "border-border text-muted-foreground",
  info: "border-info/40 text-info",
  warning: "border-warning/50 text-warning",
  success: "border-success/40 text-success",
  error: "border-error/50 text-error",
  muted: "border-border text-subtle-foreground line-through",
} as const;

export type ChipTone = keyof typeof TONES;

/** Small bordered status label, same look as the billing status chips. */
export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block rounded-sm border px-1.5 py-0.5 font-mono text-xs whitespace-nowrap",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export const SCOPE_TONE: Record<string, ChipTone> = {
  within: "success",
  out_of_scope: "error",
  unknown: "neutral",
};
