import type { MaintenanceClass, RequestKind } from "@/lib/domain/business";

/**
 * Suggests who pays for a post-launch request (pure). Only a suggestion: the team decides.
 * - A bug reported while the warranty runs is a warranty fix.
 * - Anything else covered by an active maintenance plan is included maintenance.
 * - Otherwise it is paid work (a change request or an extra invoice).
 * Questions are never billed.
 */
export function suggestClassification(input: {
  kind: RequestKind;
  /** YYYY-MM-DD the request was made. */
  date: string;
  warrantyUntil: string | null;
  plans: { startDate: string; endDate: string; status: string }[];
}): MaintenanceClass {
  if (input.kind === "question") return "included";
  if (input.kind === "bug" && input.warrantyUntil && input.date <= input.warrantyUntil)
    return "warranty";
  const covered = input.plans.some(
    (p) => p.status === "active" && p.startDate <= input.date && input.date <= p.endDate,
  );
  return covered ? "included" : "paid";
}

/** Days from `today` until `end` (negative once past). */
export function daysUntil(end: string, today: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
}

const addDaysIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Next period for a renewal, starting the day after the old plan ends. Whole-month periods
 * (1 Nov to 31 Oct) renew by months so leap years and month lengths stay right.
 */
export function renewalPeriod(startDate: string, endDate: string): { start: string; end: string } {
  const start = addDaysIso(endDate, 1);
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = start.split("-").map(Number);
  if (sd === ed) {
    const months = (ey - sy) * 12 + (em - sm);
    const next = new Date(Date.UTC(ey, em - 1 + months, ed));
    return { start, end: addDaysIso(next.toISOString().slice(0, 10), -1) };
  }
  return { start, end: addDaysIso(start, daysUntil(endDate, startDate)) };
}
