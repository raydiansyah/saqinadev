import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { invoiceItems, invoices, orgCounters, payments, paymentTerms } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";
import { addDays, invoiceNumber, todayIso } from "./rules";

export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;

const DEFAULT_DUE_DAYS = 14;

export const invoiceInput = z.union([
  z.object({
    termId: z.uuid(),
    dueDate: z.iso.date().nullable().optional(),
    notes: z.string().trim().max(2000).default(""),
  }),
  z.object({
    title: z.string().trim().min(2).max(160),
    items: z
      .array(
        z.object({
          description: z.string().trim().min(1).max(300),
          quantity: z.number().int().min(1).max(10_000),
          unitAmount: z.number().int().positive(),
        }),
      )
      .min(1)
      .max(50),
    dueDate: z.iso.date().nullable().optional(),
    notes: z.string().trim().max(2000).default(""),
  }),
]);
export type InvoiceInput = z.output<typeof invoiceInput>;

/** Creates a draft. From a payment term the amount comes from the schedule, never from input. */
export async function createInvoiceTx(
  tx: Tx,
  access: Pick<ProjectAccess, "actor" | "project">,
  data: InvoiceInput,
  metadata: Record<string, string> = {},
): Promise<Invoice> {
  const { project, actor } = access;
  let title: string;
  let lines: { description: string; quantity: number; unitAmount: number }[];
  let dueDate = data.dueDate ?? null;
  let termId: string | null = null;

  if ("termId" in data) {
    const [term] = await tx
      .select()
      .from(paymentTerms)
      .where(and(eq(paymentTerms.id, data.termId), eq(paymentTerms.projectId, project.id)))
      .for("update");
    if (!term) throw new AppError("NOT_FOUND");
    if (term.invoiceId)
      throw new AppError("CONFLICT", "Term already invoiced", { termId: "billing.termInvoiced" });
    title = term.label;
    lines = [
      { description: `${project.name}: ${term.label}`, quantity: 1, unitAmount: term.amount },
    ];
    dueDate ??= term.dueDate;
    termId = term.id;
  } else {
    title = data.title;
    lines = data.items;
  }

  const total = lines.reduce((a, l) => a + l.quantity * l.unitAmount, 0);
  const [invoice] = await tx
    .insert(invoices)
    .values({
      organizationId: project.organizationId,
      projectId: project.id,
      clientId: project.clientId,
      termId,
      title,
      currency: project.currency,
      dueDate,
      total,
      notes: data.notes,
      createdBy: actor.id,
    })
    .returning();
  await tx.insert(invoiceItems).values(
    lines.map((l, i) => ({
      invoiceId: invoice.id,
      description: l.description,
      quantity: l.quantity,
      unitAmount: l.unitAmount,
      amount: l.quantity * l.unitAmount,
      position: i,
    })),
  );
  if (termId)
    await tx.update(paymentTerms).set({ invoiceId: invoice.id }).where(eq(paymentTerms.id, termId));
  await recordActivity(tx, {
    projectId: project.id,
    actorId: actor.id,
    type: "invoice.created",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: { title, total, ...metadata },
  });
  return invoice;
}

export async function createInvoice(actor: Actor, slug: string, input: unknown) {
  const data = parse(invoiceInput, input);
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "billing:write", tx);
    const invoice = await createInvoiceTx(tx, access, data);
    return { id: invoice.id };
  });
}

/** Loads an invoice of this project under a row lock. */
export async function lockInvoice(tx: Tx, projectId: string, invoiceId: string): Promise<Invoice> {
  if (!z.uuid().safeParse(invoiceId).success) throw new AppError("NOT_FOUND");
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.projectId, projectId)))
    .for("update");
  if (!invoice) throw new AppError("NOT_FOUND");
  return invoice;
}

/** Next number for the organization and year; atomic under concurrent issues. */
async function allocateNumber(tx: Tx, organizationId: string, year: number): Promise<string> {
  const [row] = await tx
    .insert(orgCounters)
    .values({ organizationId, kind: "invoice", year, next: 2 })
    .onConflictDoUpdate({
      target: [orgCounters.organizationId, orgCounters.kind, orgCounters.year],
      set: { next: sql`${orgCounters.next} + 1` },
    })
    .returning({ next: orgCounters.next });
  return invoiceNumber(year, row.next - 1);
}

type InvoiceAction = "issue" | "send" | "cancel";

/** Status transitions. Amounts never change here; payments move the paid states. */
export async function transitionInvoice(
  actor: Actor,
  slug: string,
  invoiceId: string,
  action: InvoiceAction,
) {
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "billing:write", tx);
    const invoice = await lockInvoice(tx, project.id, invoiceId);
    const today = todayIso();

    if (action === "issue") {
      if (invoice.status !== "draft")
        throw new AppError("CONFLICT", "Only drafts can be issued", { status: "billing.notDraft" });
      const number = await allocateNumber(tx, invoice.organizationId, Number(today.slice(0, 4)));
      await tx
        .update(invoices)
        .set({
          status: "issued",
          number,
          issueDate: today,
          dueDate: invoice.dueDate ?? addDays(today, DEFAULT_DUE_DAYS),
          clientId: project.clientId,
        })
        .where(eq(invoices.id, invoice.id));
      await log(tx, actor, project.id, invoice.id, "invoice.issued", { number });
    } else if (action === "send") {
      if (!["issued", "sent", "partially_paid"].includes(invoice.status))
        throw new AppError("CONFLICT", "Invoice is not issued", { status: "billing.notIssued" });
      await tx
        .update(invoices)
        .set({ sentAt: new Date(), ...(invoice.status === "issued" ? { status: "sent" } : {}) })
        .where(eq(invoices.id, invoice.id));
      await log(tx, actor, project.id, invoice.id, "invoice.sent", { number: invoice.number });
    } else {
      if (invoice.status === "cancelled" || invoice.status === "paid")
        throw new AppError("CONFLICT", "Invoice cannot be cancelled", {
          status: "billing.cannotCancel",
        });
      const [paid] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.invoiceId, invoice.id), ne(payments.status, "void")))
        .limit(1);
      if (paid)
        throw new AppError("CONFLICT", "Void the payments first", {
          status: "billing.hasPayments",
        });
      await tx
        .update(invoices)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(invoices.id, invoice.id));
      // The term becomes invoiceable again.
      await tx
        .update(paymentTerms)
        .set({ invoiceId: null })
        .where(eq(paymentTerms.invoiceId, invoice.id));
      await log(tx, actor, project.id, invoice.id, "invoice.cancelled", { number: invoice.number });
    }
  });
}

async function log(
  tx: Tx,
  actor: Actor,
  projectId: string,
  invoiceId: string,
  type: "invoice.issued" | "invoice.sent" | "invoice.cancelled",
  metadata: Record<string, string | null>,
) {
  await recordActivity(tx, {
    projectId,
    actorId: actor.id,
    type,
    entityType: "invoice",
    entityId: invoiceId,
    metadata,
  });
}

export async function getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  return db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceItems.position));
}
