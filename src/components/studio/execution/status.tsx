"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * One badge for every execution, task and agent state. Meaning is carried by the word and a glyph,
 * not by colour alone, and there are only four tones: moving, needs a person, done, stopped.
 */
const GLYPH: Record<string, string> = {
  running: "●",
  planning: "●",
  reviewing: "●",
  cancelling: "●",
  queued: "○",
  pending: "○",
  planned: "○",
  idle: "○",
  waiting_agent: "…",
  waiting_approval: "!",
  blocked: "!",
  succeeded: "✓",
  failed: "✕",
  cancelled: "–",
};

const TONE: Record<string, string> = {
  running: "text-info border-info/40",
  planning: "text-info border-info/40",
  reviewing: "text-info border-info/40",
  cancelling: "text-warning border-warning/40",
  waiting_agent: "text-warning border-warning/40",
  waiting_approval: "text-warning border-warning/40",
  blocked: "text-warning border-warning/40",
  succeeded: "text-success border-success/40",
  failed: "text-error border-error/40",
};
const NEUTRAL = "text-muted-foreground border-border";

/** States where something is actually moving; the glyph pulses unless motion is reduced. */
const MOVING = new Set(["running", "planning", "reviewing", "cancelling"]);

export function ExecutionStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const t = useTranslations("studio.execution.status");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-xs leading-none whitespace-nowrap",
        TONE[status] ?? NEUTRAL,
        className,
      )}
    >
      <span aria-hidden="true" className={cn(MOVING.has(status) && "motion-safe:animate-pulse")}>
        {GLYPH[status] ?? "○"}
      </span>
      {t.has(status as never) ? t(status as never) : status}
    </span>
  );
}
