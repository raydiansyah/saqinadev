import "server-only";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { clients, invoices, organizations, payments, projects, receipts } from "@/lib/db/schema";
import type { Currency, PaymentMethod } from "@/lib/domain/business";
import { AppError } from "@/lib/errors";
import { type IssuerView, loadIssuer } from "@/lib/white-label/brand";
import { nextSequence } from "./numbering";
import { receiptNumber, todayIso } from "./rules";

interface PaymentFacts {
  id: string;
  amount: number;
  currency: Currency;
  paidAt: string;
  method: PaymentMethod;
  reference: string;
}

/**
 * Issues the receipt for a payment inside the payment's own transaction: either both exist or
 * neither does. The number comes from the organization's `receipt` counter for the current year.
 */
export async function issueReceiptTx(
  tx: Tx,
  input: {
    organizationId: string;
    projectId: string;
    clientId: string | null;
    invoiceId: string;
    payment: PaymentFacts;
    actorId: string | null;
  },
) {
  const year = Number(todayIso().slice(0, 4));
  const number = receiptNumber(year, await nextSequence(tx, input.organizationId, "receipt", year));
  const { payment } = input;
  const [row] = await tx
    .insert(receipts)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clientId: input.clientId,
      invoiceId: input.invoiceId,
      paymentId: payment.id,
      number,
      amount: payment.amount,
      currency: payment.currency,
      paidAt: payment.paidAt,
      method: payment.method,
      reference: payment.reference,
      createdBy: input.actorId,
    })
    .returning({ id: receipts.id, number: receipts.number });
  return row;
}

/** A voided payment voids its receipt. The number stays used. */
export async function voidReceiptTx(tx: Tx, paymentId: string) {
  await tx.update(receipts).set({ voidedAt: new Date() }).where(eq(receipts.paymentId, paymentId));
}

export interface ReceiptView {
  id: string;
  number: string;
  amount: number;
  currency: Currency;
  paidAt: string;
  method: PaymentMethod;
  reference: string;
  issuedAt: Date;
  voided: boolean;
  invoiceNumber: string | null;
  invoiceTitle: string;
  projectName: string;
  issuer: IssuerView;
  client: { name: string; company: string | null; address: string | null } | null;
}

/**
 * One receipt of a project. `includeVoid` is true for the team, which keeps seeing voided
 * receipts (marked as such); the client portal asks for confirmed ones only.
 */
export async function loadReceipt(
  projectId: string,
  receiptId: string,
  includeVoid: boolean,
): Promise<ReceiptView> {
  if (!z.uuid().safeParse(receiptId).success) throw new AppError("NOT_FOUND");
  const [row] = await db
    .select({
      r: receipts,
      invoiceNumber: invoices.number,
      invoiceTitle: invoices.title,
      projectName: projects.name,
      clientName: clients.name,
      clientCompany: clients.company,
      clientAddress: clients.address,
    })
    .from(receipts)
    .innerJoin(invoices, eq(invoices.id, receipts.invoiceId))
    .innerJoin(projects, eq(projects.id, receipts.projectId))
    .leftJoin(clients, eq(clients.id, receipts.clientId))
    .where(and(eq(receipts.id, receiptId), eq(receipts.projectId, projectId)))
    .limit(1);
  if (!row || (!includeVoid && row.r.voidedAt)) throw new AppError("NOT_FOUND");
  const { r } = row;
  return {
    id: r.id,
    number: r.number,
    amount: r.amount,
    currency: r.currency,
    paidAt: r.paidAt,
    method: r.method,
    reference: r.reference,
    issuedAt: r.issuedAt,
    voided: r.voidedAt !== null,
    invoiceNumber: row.invoiceNumber,
    invoiceTitle: row.invoiceTitle,
    projectName: row.projectName,
    issuer: await loadIssuer(r.organizationId),
    client: row.clientName
      ? { name: row.clientName, company: row.clientCompany, address: row.clientAddress }
      : null,
  };
}

/**
 * Issues the receipt of a confirmed payment that has none yet (payments recorded before receipts
 * existed). A payment has at most one receipt: asking again returns the existing one.
 */
export async function issueReceiptForPayment(actor: Actor, slug: string, paymentId: string) {
  if (!z.uuid().safeParse(paymentId).success) throw new AppError("NOT_FOUND");
  return db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "billing:write", tx);
    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.projectId, project.id)))
      .for("update");
    if (!payment) throw new AppError("NOT_FOUND");
    if (payment.status === "void")
      throw new AppError("CONFLICT", "Payment is void", { status: "billing.alreadyVoid" });
    const [existing] = await tx
      .select({ id: receipts.id, number: receipts.number })
      .from(receipts)
      .where(eq(receipts.paymentId, payment.id));
    if (existing) return existing;
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, payment.invoiceId));
    const receipt = await issueReceiptTx(tx, {
      organizationId: invoice.organizationId,
      projectId: project.id,
      clientId: invoice.clientId ?? project.clientId,
      invoiceId: invoice.id,
      payment,
      actorId: actor.id,
    });
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "receipt.issued",
      entityType: "receipt",
      entityId: receipt.id,
      metadata: { number: receipt.number },
    });
    return receipt;
  });
}
