import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { todayIso } from "@/lib/billing/rules";
import { type BillingTotals, toInvoiceRow, totalsOf } from "@/lib/billing/summary";
import { db } from "@/lib/db/client";
import {
  activities,
  documents,
  invoiceItems,
  invoices,
  milestones,
  payments,
  projects,
  scopeItems,
  tasks,
} from "@/lib/db/schema";
import type {
  Currency,
  EffectiveInvoiceStatus,
  PaymentMethod,
  ScopeCategory,
} from "@/lib/domain/business";
import type { ProjectStatus } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import type { ClientProjectAccess } from "./access";
import { type ClientProgress, clientProgress } from "./progress";

/**
 * Portal read models. Every function returns an explicit whitelist of fields; raw rows never
 * reach the portal, so internal notes, agents, models, repositories and task details cannot
 * leak by accident when a table gains a column.
 */

type Project = typeof projects.$inferSelect;

export type ClientStageKey = "planning" | "development" | "review" | "completed" | "paused";

const STAGE: Record<ProjectStatus, ClientStageKey> = {
  draft: "planning",
  interview: "planning",
  planning: "planning",
  ready: "development",
  building: "development",
  review: "review",
  paused: "paused",
  completed: "completed",
  archived: "completed",
};

export interface ClientProjectSummary {
  slug: string;
  name: string;
  stage: ClientStageKey;
  progress: ClientProgress;
  currency: Currency;
  totals: BillingTotals;
}

async function progressFor(projectIds: string[]) {
  if (projectIds.length === 0) return new Map<string, ClientProgress>();
  const [ms, ts] = await Promise.all([
    db
      .select({
        id: milestones.id,
        projectId: milestones.projectId,
        title: milestones.title,
        clientTitle: milestones.clientTitle,
        clientVisible: milestones.clientVisible,
      })
      .from(milestones)
      .where(inArray(milestones.projectId, projectIds))
      .orderBy(asc(milestones.position)),
    db
      .select({ projectId: tasks.projectId, milestoneId: tasks.milestoneId, status: tasks.status })
      .from(tasks)
      .where(inArray(tasks.projectId, projectIds)),
  ]);
  return new Map(
    projectIds.map((id) => [
      id,
      clientProgress(
        ms.filter((m) => m.projectId === id),
        ts.filter((t) => t.projectId === id),
      ),
    ]),
  );
}

async function totalsFor(list: Project[]) {
  if (list.length === 0) return new Map<string, BillingTotals>();
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        inArray(
          invoices.projectId,
          list.map((p) => p.id),
        ),
        ne(invoices.status, "draft"),
      ),
    );
  const today = todayIso();
  return new Map(
    list.map((p) => [
      p.id,
      totalsOf(
        rows.filter((r) => r.projectId === p.id).map((r) => toInvoiceRow(r, today)),
        p.value,
      ),
    ]),
  );
}

export async function clientProjectSummaries(list: Project[]): Promise<ClientProjectSummary[]> {
  const ids = list.map((p) => p.id);
  const [progress, totals] = await Promise.all([progressFor(ids), totalsFor(list)]);
  return list.map((p) => ({
    slug: p.slug,
    name: p.name,
    stage: STAGE[p.status],
    progress: progress.get(p.id) ?? clientProgress([], []),
    currency: p.currency,
    totals: totals.get(p.id) ?? totalsOf([], p.value),
  }));
}

export interface ClientProjectView extends ClientProjectSummary {
  description: string;
  clientName: string;
}

export async function clientProjectView(access: ClientProjectAccess): Promise<ClientProjectView> {
  const [summary] = await clientProjectSummaries([access.project]);
  return { ...summary, description: access.project.description, clientName: access.client.name };
}

export interface ClientScopeItem {
  title: string;
  description: string;
  category: ScopeCategory;
}

export async function clientScope(access: ClientProjectAccess): Promise<ClientScopeItem[]> {
  return db
    .select({
      title: scopeItems.title,
      description: scopeItems.description,
      category: scopeItems.category,
    })
    .from(scopeItems)
    .where(and(eq(scopeItems.projectId, access.project.id), eq(scopeItems.clientVisible, true)))
    .orderBy(asc(scopeItems.category), asc(scopeItems.position));
}

const sharedDocs = (projectId: string) =>
  and(
    eq(documents.projectId, projectId),
    eq(documents.clientVisible, true),
    inArray(documents.status, ["approved", "signed"]),
  );

export interface ClientDocument {
  slug: string;
  title: string;
  version: number;
  updatedAt: Date;
}

export async function clientDocuments(access: ClientProjectAccess): Promise<ClientDocument[]> {
  return db
    .select({
      slug: documents.slug,
      title: documents.title,
      version: documents.version,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(sharedDocs(access.project.id))
    .orderBy(asc(documents.title));
}

export async function clientDocument(access: ClientProjectAccess, slug: string) {
  const [doc] = await db
    .select({
      slug: documents.slug,
      title: documents.title,
      version: documents.version,
      updatedAt: documents.updatedAt,
      content: documents.content,
    })
    .from(documents)
    .where(and(sharedDocs(access.project.id), eq(documents.slug, slug)))
    .limit(1);
  if (!doc) throw new AppError("NOT_FOUND");
  return doc;
}

export interface ClientInvoice {
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
}

/** Issued invoices only: drafts are internal until issued. */
const clientInvoiceFilter = (projectId: string) =>
  and(eq(invoices.projectId, projectId), ne(invoices.status, "draft"));

const toClientInvoice = (i: typeof invoices.$inferSelect): ClientInvoice => {
  const row = toInvoiceRow(i);
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    status: row.status,
    currency: row.currency,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    total: row.total,
    amountPaid: row.amountPaid,
    balance: row.balance,
  };
};

export async function clientInvoices(access: ClientProjectAccess): Promise<ClientInvoice[]> {
  const rows = await db
    .select()
    .from(invoices)
    .where(clientInvoiceFilter(access.project.id))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt));
  return rows.map(toClientInvoice);
}

export async function clientInvoice(access: ClientProjectAccess, invoiceId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) throw new AppError("NOT_FOUND");
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(clientInvoiceFilter(access.project.id), eq(invoices.id, invoiceId)))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND");
  const items = await db
    .select({
      description: invoiceItems.description,
      quantity: invoiceItems.quantity,
      unitAmount: invoiceItems.unitAmount,
      amount: invoiceItems.amount,
    })
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, row.id))
    .orderBy(asc(invoiceItems.position));
  return { invoice: toClientInvoice(row), items };
}

export interface ClientPayment {
  paidAt: string;
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  invoiceNumber: string | null;
}

/** Confirmed payments only; voided corrections are internal bookkeeping. */
export async function clientPayments(access: ClientProjectAccess): Promise<ClientPayment[]> {
  return db
    .select({
      paidAt: payments.paidAt,
      amount: payments.amount,
      currency: payments.currency,
      method: payments.method,
      invoiceNumber: invoices.number,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(and(eq(payments.projectId, access.project.id), eq(payments.status, "confirmed")))
    .orderBy(desc(payments.paidAt));
}

export type ClientActivityKind = "invoice_issued" | "payment_received" | "document_shared";

export interface ClientActivity {
  kind: ClientActivityKind;
  label: string;
  createdAt: Date;
}

/**
 * A short, plain-language feed. Built from a fixed whitelist of event types; metadata is
 * reduced to one label (invoice number or document title), never passed through.
 */
export async function clientActivity(access: ClientProjectAccess): Promise<ClientActivity[]> {
  const rows = await db
    .select({
      type: activities.type,
      entityId: activities.entityId,
      metadata: activities.metadata,
      createdAt: activities.createdAt,
    })
    .from(activities)
    .where(
      and(
        eq(activities.projectId, access.project.id),
        inArray(activities.type, ["invoice.issued", "payment.recorded", "document.updated"]),
      ),
    )
    .orderBy(desc(activities.createdAt))
    .limit(100);
  const docs = await clientDocuments(access);
  const confirmedIds = new Set(
    (
      await db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.projectId, access.project.id), eq(payments.status, "confirmed")))
    ).map((p) => p.id),
  );
  const sharedSlugs = new Map(docs.map((d) => [d.slug, d.title]));
  const out: ClientActivity[] = [];
  for (const r of rows) {
    if (r.type === "invoice.issued")
      out.push({
        kind: "invoice_issued",
        label: String(r.metadata.number ?? ""),
        createdAt: r.createdAt,
      });
    else if (r.type === "payment.recorded" && r.entityId && confirmedIds.has(r.entityId))
      out.push({
        kind: "payment_received",
        label: String(r.metadata.invoice ?? ""),
        createdAt: r.createdAt,
      });
    else if (r.type === "document.updated" && r.metadata.shared === true) {
      const title = sharedSlugs.get(String(r.metadata.slug));
      if (title) out.push({ kind: "document_shared", label: title, createdAt: r.createdAt });
    }
  }
  return out.slice(0, 30);
}
