import type { ReminderAudience, ReminderKind } from "@/lib/domain/business";

/**
 * Reminder timing (pure). Each kind has an anchor date (invoice due date, approval request,
 * plan end) and offsets in days around it. A run fires at most the latest offset that has been
 * reached, so a cron that was down for a week sends one reminder, not a burst.
 */

export interface RuleLike {
  id: string;
  kind: ReminderKind;
  offsetDays: number;
  audience: ReminderAudience;
  enabled: boolean;
}

export const DEFAULT_RULES: {
  kind: ReminderKind;
  offsetDays: number;
  audience: ReminderAudience;
}[] = [
  { kind: "invoice_due", offsetDays: -7, audience: "client" },
  { kind: "invoice_due", offsetDays: -3, audience: "client" },
  { kind: "invoice_due", offsetDays: 0, audience: "both" },
  { kind: "invoice_overdue", offsetDays: 1, audience: "both" },
  { kind: "invoice_overdue", offsetDays: 7, audience: "both" },
  { kind: "approval_pending", offsetDays: 3, audience: "client" },
  { kind: "change_request_pending", offsetDays: 3, audience: "client" },
  { kind: "maintenance_renewal", offsetDays: -30, audience: "team" },
  { kind: "maintenance_renewal", offsetDays: -14, audience: "both" },
];

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * The rule to fire today for one entity, or null. `before` kinds (due, renewal) stop at the
 * anchor; `after` kinds (overdue, pending) start after it.
 */
export function pickRule(
  rules: RuleLike[],
  kind: ReminderKind,
  anchor: string,
  today: string,
): RuleLike | null {
  const elapsed = dayDiff(anchor, today);
  const candidates = rules
    .filter((r) => r.enabled && r.kind === kind && r.offsetDays <= elapsed)
    .sort((a, b) => b.offsetDays - a.offsetDays);
  const rule = candidates[0];
  if (!rule) return null;
  // "Due in N days" reminders are pointless once the date has passed: overdue rules take over.
  if ((kind === "invoice_due" || kind === "maintenance_renewal") && elapsed > 0) return null;
  return rule;
}

/** Dedup window: the same rule never fires twice for the same entity and anchor. */
export const windowKey = (anchor: string, offsetDays: number) => `${anchor}:${offsetDays}`;
