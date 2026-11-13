import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { createInvoice, transitionInvoice } from "@/lib/billing/invoices";
import { recordPayment, voidPayment } from "@/lib/billing/payments";
import { issueReceiptForPayment, loadReceipt } from "@/lib/billing/receipts";
import { projectBilling } from "@/lib/billing/summary";
import { acceptInvitation, createInvitation } from "@/lib/clients/invitations";
import { createClient, setProjectClient } from "@/lib/clients/service";
import { db } from "@/lib/db/client";
import { projectMembers, receipts } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { listNotifications } from "@/lib/notifications/service";
import { loadClientProjectAccess } from "@/lib/portal/access";
import { clientPayments, clientReceipt } from "@/lib/portal/views";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

const year = new Date().getUTCFullYear();

let owner: Actor;
let client: Actor;
let slug: string;
let projectId: string;

async function setup(email = "client@abc.test") {
  owner = await createUser("Owner");
  slug = await project(owner, "Cafe point of sale");
  const c = await createClient(owner, { name: "PT ABC", company: "ABC Group", email });
  await setProjectClient(owner, slug, { clientId: c.id, portalEnabled: true, currency: "IDR" });
  const { url } = await createInvitation(owner, c.id, { email });
  client = await createUser("Budi", email);
  await acceptInvitation(client, url.split("/invite/")[1]);
  projectId = (await loadProjectAccess(owner, { slug }, "project:read")).project.id;
}

async function issuedInvoice(amount = 1_000_000) {
  const invoice = await createInvoice(owner, slug, {
    title: "Website, first half",
    items: [{ description: "Work", quantity: 1, unitAmount: amount }],
  });
  await transitionInvoice(owner, slug, invoice.id, "issue");
  return invoice.id;
}

const pay = (invoiceId: string, amount: number, reference = "BCA-1") =>
  recordPayment(owner, slug, invoiceId, {
    amount,
    paidAt: "2026-10-01",
    method: "bank_transfer",
    reference,
  });

beforeEach(async () => {
  await resetDatabase();
  await setup();
});

describe("receipt per payment", () => {
  it("issues a numbered receipt in the same step as the payment, copying its figures", async () => {
    const invoiceId = await issuedInvoice();
    const first = await pay(invoiceId, 400_000);
    const second = await pay(invoiceId, 100_000, "BCA-2");
    expect(first.receiptNumber).toBe(`KWT-${year}-001`);
    expect(second.receiptNumber).toBe(`KWT-${year}-002`);

    const view = await loadReceipt(projectId, first.receiptId, true);
    expect(view).toMatchObject({
      number: `KWT-${year}-001`,
      amount: 400_000,
      currency: "IDR",
      paidAt: "2026-10-01",
      method: "bank_transfer",
      reference: "BCA-1",
      voided: false,
      invoiceTitle: "Website, first half",
      projectName: "Cafe point of sale",
      client: { name: "PT ABC", company: "ABC Group" },
    });
    expect(view.invoiceNumber).toMatch(/^INV-\d{4}-001$/);
  });

  it("numbers receipts without gaps or repeats when payments arrive together", async () => {
    const invoiceId = await issuedInvoice(10_000_000);
    await Promise.all([1, 2, 3, 4, 5].map((n) => pay(invoiceId, 100_000, `ref-${n}`)));
    const numbers = (await db.select().from(receipts)).map((r) => r.number).sort();
    expect(numbers).toEqual([1, 2, 3, 4, 5].map((n) => `KWT-${year}-00${n}`));
  });

  it("voids the receipt with the payment and never reuses its number", async () => {
    const invoiceId = await issuedInvoice();
    const first = await pay(invoiceId, 400_000);
    const ledger = await projectBilling({ id: projectId, currency: "IDR", value: null });
    await voidPayment(owner, slug, ledger.ledger[0].id, { reason: "Entered twice" });

    const [row] = await db.select().from(receipts).where(eq(receipts.id, first.receiptId));
    expect(row.voidedAt).not.toBeNull();
    expect((await loadReceipt(projectId, first.receiptId, true)).voided).toBe(true);
    expect(await code(loadReceipt(projectId, first.receiptId, false))).toBe("NOT_FOUND");

    const next = await pay(invoiceId, 400_000);
    expect(next.receiptNumber).toBe(`KWT-${year}-002`);
  });

  it("tells the client, who then reads it on the portal", async () => {
    const invoiceId = await issuedInvoice();
    const { receiptId } = await pay(invoiceId, 400_000);
    expect((await listNotifications(client)).map((n) => n.type)).toContain("receipt.issued");

    const access = await loadClientProjectAccess(client, slug);
    expect((await clientReceipt(access, receiptId)).amount).toBe(400_000);
    const [payment] = await clientPayments(access);
    expect(payment.receipt?.id).toBe(receiptId);
  });

  it("does not show a receipt to another client, a stranger, or in another project", async () => {
    const invoiceId = await issuedInvoice();
    const { receiptId } = await pay(invoiceId, 400_000);

    const otherOwner = await createUser("Other Owner");
    const otherSlug = await project(otherOwner, "Other project");
    const oc = await createClient(otherOwner, { name: "Other", email: "o@other.test" });
    await setProjectClient(otherOwner, otherSlug, {
      clientId: oc.id,
      portalEnabled: true,
      currency: "IDR",
    });
    const inv = await createInvitation(otherOwner, oc.id, { email: "o@other.test" });
    const otherClient = await createUser("Other", "o@other.test");
    await acceptInvitation(otherClient, inv.url.split("/invite/")[1]);

    expect(await code(loadClientProjectAccess(otherClient, slug))).toBe("NOT_FOUND");
    const otherAccess = await loadClientProjectAccess(otherClient, otherSlug);
    expect(await code(clientReceipt(otherAccess, receiptId))).toBe("NOT_FOUND");
    expect(
      await code(
        loadReceipt(
          (await loadProjectAccess(otherOwner, { slug: otherSlug }, "project:read")).project.id,
          receiptId,
          true,
        ),
      ),
    ).toBe("NOT_FOUND");
    expect(await code(loadReceipt(projectId, "not-a-uuid", true))).toBe("NOT_FOUND");
  });
});

describe("a payment recorded before receipts existed", () => {
  it("gets its receipt on request, once, and only from someone who can write billing", async () => {
    const invoiceId = await issuedInvoice();
    const { receiptId } = await pay(invoiceId, 400_000);
    const ledger = await projectBilling({ id: projectId, currency: "IDR", value: null });
    const paymentId = ledger.ledger[0].id;
    await db.delete(receipts).where(eq(receipts.id, receiptId));

    const viewer = await createUser("Viewer");
    await db.insert(projectMembers).values({ projectId, userId: viewer.id, role: "viewer" });
    expect(await code(issueReceiptForPayment(viewer, slug, paymentId))).toBe("AUTHORIZATION_ERROR");

    const issued = await issueReceiptForPayment(owner, slug, paymentId);
    // The deleted receipt's number was used; the counter does not go back.
    expect(issued.number).toBe(`KWT-${year}-002`);
    const again = await issueReceiptForPayment(owner, slug, paymentId);
    expect(again.id).toBe(issued.id);
    expect(await db.select().from(receipts)).toHaveLength(1);
  });

  it("is refused for a voided payment", async () => {
    const invoiceId = await issuedInvoice();
    await pay(invoiceId, 400_000);
    const { ledger } = await projectBilling({ id: projectId, currency: "IDR", value: null });
    await voidPayment(owner, slug, ledger[0].id, { reason: "Mistake" });
    await db.delete(receipts);
    expect(await code(issueReceiptForPayment(owner, slug, ledger[0].id))).toBe("CONFLICT");
  });
});
