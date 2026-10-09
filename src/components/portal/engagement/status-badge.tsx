import { cn } from "@/lib/utils";

const TONES = {
  waiting: "border-warning/40 text-warning",
  good: "border-success/40 text-success",
  bad: "border-error/50 text-error",
  neutral: "border-border-strong text-muted-foreground",
} as const;

export type BadgeTone = keyof typeof TONES;

/** Small status pill shared by the engagement pages; the caller supplies translated text. */
export function StatusBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs whitespace-nowrap",
        TONES[tone],
      )}
    >
      {label}
    </span>
  );
}
