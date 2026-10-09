import type { EffectiveInvoiceStatus, InvoiceStatus } from "@/lib/domain/business";

/**
 * Pure billing rules: invoice status derivation and payment schedule validation. Kept free of
 * database access so the arithmetic is unit tested in isolation.
 */

/** Calendar date (YYYY-MM-DD, UTC) used for due-date comparisons. */
export const todayIso = (now = new Date()) => now.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface InvoiceLike {
  status: InvoiceStatus;
  dueDate: string | null;
  total: number;
  amountPaid: number;
}

const OPEN: InvoiceStatus[] = ["issued", "sent", "partially_paid"];
export const isOpen = (status: InvoiceStatus) => OPEN.includes(status);

/** Overdue is not stored: an open invoice past its due date reads as overdue. */
export function effectiveStatus(invoice: InvoiceLike, today = todayIso()): EffectiveInvoiceStatus {
  if (isOpen(invoice.status) && invoice.dueDate && invoice.dueDate < today) return "overdue";
  return invoice.status;
}

export const balanceDue = (invoice: Pick<InvoiceLike, "total" | "amountPaid">) =>
  Math.max(0, invoice.total - invoice.amountPaid);

/** Status after payments change. Never moves a draft or cancelled invoice. */
export function statusAfterPayments(
  current: InvoiceStatus,
  total: number,
  paid: number,
  wasSent: boolean,
): InvoiceStatus {
  if (current === "draft" || current === "cancelled") return current;
  if (paid >= total && total > 0) return "paid";
  if (paid > 0) return "partially_paid";
  return wasSent ? "sent" : "issued";
}

export interface TermInput {
  label: string;
  percentBp?: number | null;
  amount?: number | null;
}

/**
 * Resolves term amounts against the project value (percentages always refer to the whole
 * value). Percentage terms are floored and the last
 * percentage term absorbs the rounding remainder; the result must add up to the value exactly.
 * Returns null when the terms do not add up.
 */
export function resolveTermAmounts(
  value: number,
  terms: TermInput[],
  /** What these terms must add up to; less than the value when earlier terms are invoiced. */
  target = value,
): number[] | null {
  if (terms.length === 0) return [];
  const amounts = terms.map((t) =>
    t.percentBp != null ? Math.floor((value * t.percentBp) / 10_000) : (t.amount ?? 0),
  );
  if (amounts.some((a) => a <= 0)) return null;
  let diff = target - amounts.reduce((a, b) => a + b, 0);
  const lastPercent = terms.map((t) => t.percentBp != null).lastIndexOf(true);
  // Only rounding remainders (smaller than one unit per term) are absorbed.
  if (diff !== 0 && lastPercent >= 0 && Math.abs(diff) < terms.length) {
    amounts[lastPercent] += diff;
    diff = 0;
  }
  return diff === 0 ? amounts : null;
}

/** "INV-2026-007" */
export const invoiceNumber = (year: number, n: number) =>
  `INV-${year}-${String(n).padStart(3, "0")}`;
