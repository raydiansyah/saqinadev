import "server-only";
import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, payments, projects } from "@/lib/db/schema";
import type { Currency, EffectiveInvoiceStatus, PaymentMethod } from "@/lib/domain/business";
import { balanceDue, effectiveStatus, isOpen, todayIso } from "./rules";
import { listTerms } from "./terms";

/**
 * Read models for billing. Every number here is computed from stored invoices and payments;
 * nothing is estimated.
 */

export interface InvoiceRow {
  id: string;
  number: string | null;
  title: string;
  status: EffectiveInvoiceStatus;
  currency: Currency;
  issueDate: string | null;
  dueDate: string | null;
  total: number;
  amountPaid: number;
  balance: number;
  termId: string | null;
}

export interface LedgerEntry {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceTitle: string;
  amount: number;
  paidAt: string;
  method: PaymentMethod;
  reference: string;
  status: "confirmed" | "void";
  voidReason: string | null;
}

export interface BillingTotals {
  value: number | null;
  invoiced: number;
  paid: number;
  outstanding: number;
  overdue: number;
  /** Part of the value not invoiced yet (null without a value). */
  uninvoiced: number | null;
}

export function toInvoiceRow(i: typeof invoices.$inferSelect, today = todayIso()): InvoiceRow {
  return {
    id: i.id,
    number: i.number,
    title: i.title,
    status: effectiveStatus(i, today),
    currency: i.currency,
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    total: i.total,
    amountPaid: i.amountPaid,
    balance: balanceDue(i),
    termId: i.termId,
  };
}

export function totalsOf(rows: InvoiceRow[], value: number | null): BillingTotals {
  const billed = rows.filter((r) => r.status !== "draft" && r.status !== "cancelled");
  const invoiced = billed.reduce((a, r) => a + r.total, 0);
  const paid = billed.reduce((a, r) => a + r.amountPaid, 0);
  const overdue = billed.filter((r) => r.status === "overdue").reduce((a, r) => a + r.balance, 0);
  return {
    value,
    invoiced,
    paid,
    outstanding: invoiced - paid,
    overdue,
    uninvoiced: value === null ? null : Math.max(0, value - invoiced),
  };
}

export async function projectBilling(project: {
  id: string;
  currency: Currency;
  value: number | null;
}) {
  const today = todayIso();
  const [invoiceRows, terms, ledgerRows] = await Promise.all([
    db
      .select()
      .from(invoices)
      .where(eq(invoices.projectId, project.id))
      .orderBy(desc(invoices.createdAt)),
    listTerms(project.id),
    db
      .select({
        id: payments.id,
        invoiceId: payments.invoiceId,
        invoiceNumber: invoices.number,
        invoiceTitle: invoices.title,
        amount: payments.amount,
        paidAt: payments.paidAt,
        method: payments.method,
        reference: payments.reference,
        status: payments.status,
        voidReason: payments.voidReason,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(eq(payments.projectId, project.id))
      .orderBy(desc(payments.paidAt), desc(payments.createdAt)),
  ]);
  const rows = invoiceRows.map((i) => toInvoiceRow(i, today));
  return {
    currency: project.currency,
    totals: totalsOf(rows, project.value),
    terms,
    invoices: rows,
    ledger: ledgerRows as LedgerEntry[],
  };
}
export type ProjectBilling = Awaited<ReturnType<typeof projectBilling>>;

export interface OrgInvoiceRow extends InvoiceRow {
  projectSlug: string;
  projectName: string;
}

/** Organization-wide invoices with totals per currency, for the owner dashboard. */
export async function orgBilling(organizationId: string) {
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [rows, monthPayments] = await Promise.all([
    db
      .select({ invoice: invoices, slug: projects.slug, name: projects.name })
      .from(invoices)
      .innerJoin(projects, eq(projects.id, invoices.projectId))
      .where(eq(invoices.organizationId, organizationId))
      .orderBy(desc(invoices.createdAt))
      .limit(500),
    db
      .select({ amount: payments.amount, currency: payments.currency })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(payments.status, "confirmed"),
          gte(payments.paidAt, monthStart),
        ),
      ),
  ]);
  const list: OrgInvoiceRow[] = rows.map((r) => ({
    ...toInvoiceRow(r.invoice, today),
    projectSlug: r.slug,
    projectName: r.name,
  }));
  const byCurrency = new Map<
    Currency,
    { outstanding: number; overdue: number; paidThisMonth: number }
  >();
  const bucket = (c: Currency) => {
    let b = byCurrency.get(c);
    if (!b) {
      b = { outstanding: 0, overdue: 0, paidThisMonth: 0 };
      byCurrency.set(c, b);
    }
    return b;
  };
  for (const r of list) {
    if (!isOpen(r.status === "overdue" ? "issued" : r.status)) continue;
    bucket(r.currency).outstanding += r.balance;
    if (r.status === "overdue") bucket(r.currency).overdue += r.balance;
  }
  for (const p of monthPayments) bucket(p.currency).paidThisMonth += p.amount;
  return { invoices: list, totals: [...byCurrency].map(([currency, t]) => ({ currency, ...t })) };
}

/** Payments across the organization, newest first. */
export async function orgPayments(organizationId: string) {
  return db
    .select({
      id: payments.id,
      amount: payments.amount,
      currency: payments.currency,
      paidAt: payments.paidAt,
      method: payments.method,
      reference: payments.reference,
      status: payments.status,
      invoiceNumber: invoices.number,
      projectSlug: projects.slug,
      projectName: projects.name,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(projects, eq(projects.id, payments.projectId))
    .where(eq(invoices.organizationId, organizationId))
    .orderBy(desc(payments.paidAt), desc(payments.createdAt))
    .limit(500);
}

/** Totals for several projects at once (dashboard cards, portal list). */
export async function billingTotalsFor(
  list: { id: string; value: number | null }[],
): Promise<Map<string, BillingTotals>> {
  const out = new Map<string, BillingTotals>();
  if (list.length === 0) return out;
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        inArray(
          invoices.projectId,
          list.map((p) => p.id),
        ),
        ne(invoices.status, "cancelled"),
      ),
    );
  const today = todayIso();
  for (const p of list)
    out.set(
      p.id,
      totalsOf(
        rows.filter((r) => r.projectId === p.id).map((r) => toInvoiceRow(r, today)),
        p.value,
      ),
    );
  return out;
}
