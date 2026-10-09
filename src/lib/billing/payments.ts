import "server-only";
import { and, eq, sum } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { invoices, payments } from "@/lib/db/schema";
import { PAYMENT_METHODS } from "@/lib/domain/business";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";
import { lockInvoice } from "./invoices";
import { addDays, balanceDue, isOpen, statusAfterPayments, todayIso } from "./rules";

export type Payment = typeof payments.$inferSelect;

const paymentInput = z.object({
  amount: z.number().int().positive(),
  paidAt: z.iso.date(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(200).default(""),
});

/** Recomputes the paid amount from confirmed payments; the stored total is never trusted. */
async function refreshInvoice(tx: Tx, invoiceId: string) {
  const [{ paid }] = await tx
    .select({ paid: sum(payments.amount).mapWith(Number) })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), eq(payments.status, "confirmed")));
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
  const amountPaid = paid ?? 0;
  await tx
    .update(invoices)
    .set({
      amountPaid,
      status: statusAfterPayments(
        invoice.status,
        invoice.total,
        amountPaid,
        invoice.sentAt !== null,
      ),
    })
    .where(eq(invoices.id, invoiceId));
}

/**
 * Records money received against an issued invoice. Entered by a person from their own
 * records (bank statement, receipt); the assistant never calls this.
 */
export async function recordPayment(actor: Actor, slug: string, invoiceId: string, input: unknown) {
  const data = parse(paymentInput, input);
  // One day of slack: the server clock is UTC, the person entering it may be up to UTC+14.
  if (data.paidAt > addDays(todayIso(), 1))
    throw new AppError("VALIDATION_ERROR", "Payment date is in the future", {
      paidAt: "billing.futureDate",
    });
  return db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "billing:write", tx);
    const invoice = await lockInvoice(tx, project.id, invoiceId);
    if (!isOpen(invoice.status))
      throw new AppError("CONFLICT", "Invoice is not open", { status: "billing.notOpen" });
    if (data.amount > balanceDue(invoice))
      throw new AppError("VALIDATION_ERROR", "Amount exceeds the balance", {
        amount: "billing.overpay",
      });
    const [payment] = await tx
      .insert(payments)
      .values({
        ...data,
        invoiceId: invoice.id,
        projectId: project.id,
        currency: invoice.currency,
        recordedBy: actor.id,
      })
      .returning({ id: payments.id });
    await refreshInvoice(tx, invoice.id);
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "payment.recorded",
      entityType: "payment",
      entityId: payment.id,
      metadata: { invoice: invoice.number, amount: data.amount, method: data.method },
    });
    return { id: payment.id };
  });
}

/** Payments are never deleted. A mistaken entry is voided with a reason and audited. */
export async function voidPayment(actor: Actor, slug: string, paymentId: string, input: unknown) {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(300) }), input);
  if (!z.uuid().safeParse(paymentId).success) throw new AppError("NOT_FOUND");
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "billing:write", tx);
    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.projectId, project.id)))
      .for("update");
    if (!payment) throw new AppError("NOT_FOUND");
    if (payment.status === "void")
      throw new AppError("CONFLICT", "Already void", { status: "billing.alreadyVoid" });
    await lockInvoice(tx, project.id, payment.invoiceId);
    await tx
      .update(payments)
      .set({ status: "void", voidedBy: actor.id, voidedAt: new Date(), voidReason: reason })
      .where(eq(payments.id, payment.id));
    await refreshInvoice(tx, payment.invoiceId);
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "payment.voided",
      entityType: "payment",
      entityId: payment.id,
      metadata: { amount: payment.amount },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: project.id,
      type: "payment.voided",
      entityType: "payment",
      entityId: payment.id,
      metadata: { amount: payment.amount, reason },
    });
  });
}
