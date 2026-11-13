"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { createInvoice, transitionInvoice } from "@/lib/billing/invoices";
import { recordPayment, voidPayment } from "@/lib/billing/payments";
import { issueReceiptForPayment } from "@/lib/billing/receipts";
import { setPaymentSchedule } from "@/lib/billing/terms";
import { sendClientReminder } from "@/lib/reminders/manual";
import { parse } from "@/lib/validation";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

const transition = z.enum(["issue", "send", "cancel"]);

export async function setScheduleAction(slug: string, input: unknown) {
  return runAction("billing.schedule", { slug }, async () => {
    await setPaymentSchedule(await requireActor(), slug, input);
    refresh();
  });
}

export async function createInvoiceAction(slug: string, input: unknown) {
  return runAction("invoice.create", { slug }, async () => {
    const result = await createInvoice(await requireActor(), slug, input);
    refresh();
    return result;
  });
}

export async function transitionInvoiceAction(slug: string, invoiceId: string, action: unknown) {
  return runAction("invoice.transition", { slug, invoiceId }, async () => {
    const step = parse(transition, action);
    await transitionInvoice(await requireActor(), slug, invoiceId, step);
    refresh();
  });
}

export async function recordPaymentAction(slug: string, invoiceId: string, input: unknown) {
  return runAction("payment.record", { slug, invoiceId }, async () => {
    const result = await recordPayment(await requireActor(), slug, invoiceId, input);
    refresh();
    return result;
  });
}

export async function voidPaymentAction(slug: string, paymentId: string, input: unknown) {
  return runAction("payment.void", { slug, paymentId }, async () => {
    await voidPayment(await requireActor(), slug, paymentId, input);
    refresh();
  });
}

/** For a payment recorded before receipts existed. */
export async function issueReceiptAction(slug: string, paymentId: string) {
  return runAction("receipt.issue", { slug, paymentId }, async () => {
    const result = await issueReceiptForPayment(await requireActor(), slug, paymentId);
    refresh();
    return result;
  });
}

/** A reminder to the client now, for one open invoice. At most one per invoice per day. */
export async function remindInvoiceAction(slug: string, invoiceId: string) {
  return runAction("invoice.remind", { slug, invoiceId }, async () => {
    return sendClientReminder(await requireActor(), slug, {
      entityType: "invoice",
      entityId: invoiceId,
    });
  });
}
