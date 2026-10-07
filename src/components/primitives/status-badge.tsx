import { cn } from "@/lib/utils";

/** Status ids; translated labels live under `common.status` in the message files. */
export const STATUS_KEYS = [
  "Backlog",
  "Planning",
  "In Progress",
  "Review",
  "Waiting Approval",
  "Revision",
  "Approved",
  "Completed",
  "Failed",
  "Rejected",
  "Blocked",
] as const;
export type Status = (typeof STATUS_KEYS)[number];

/** Status colors carry meaning: green done, blue moving, amber needs a human, red stopped. */
const TONE: Record<Status, string> = {
  Backlog: "text-subtle-foreground border-border",
  Planning: "text-info border-info/40",
  "In Progress": "text-info border-info/40",
  Review: "text-warning border-warning/40",
  "Waiting Approval": "text-warning border-warning/40",
  Revision: "text-warning border-warning/40",
  Approved: "text-success border-success/40",
  Completed: "text-success border-success/40",
  Failed: "text-error border-error/40",
  Rejected: "text-error border-error/40",
  Blocked: "text-error border-error/40",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: Status;
  /** Translated label; defaults to the status id. */
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-xs leading-none whitespace-nowrap",
        TONE[status],
        className,
      )}
    >
      {label ?? status}
    </span>
  );
}
