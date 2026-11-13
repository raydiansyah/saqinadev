import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { createInvoice, transitionInvoice } from "@/lib/billing/invoices";
import { recordPayment } from "@/lib/billing/payments";
import { addDays, todayIso } from "@/lib/billing/rules";
import { listTerms, setPaymentSchedule } from "@/lib/billing/terms";
import { acceptInvitation, createInvitation } from "@/lib/clients/invitations";
import { createClient, setProjectClient } from "@/lib/clients/service";
import { db } from "@/lib/db/client";
import { clients, notificationDeliveries, receipts, users } from "@/lib/db/schema";
import { generateBusinessDocument } from "@/lib/documents/business";
import { setDocumentClientVisible, setDocumentStatus } from "@/lib/documents/service";
import { signAsTeam } from "@/lib/documents/signing";
import { AppError } from "@/lib/errors";
import { authorizePdf } from "@/lib/pdf/access";
import { buildDocumentPdf, buildInvoicePdf, buildReceiptPdf } from "@/lib/pdf/build";
import { orgRules, runReminders, setRuleWhatsapp } from "@/lib/reminders/service";
import { saveBrand, saveLogo } from "@/lib/white-label/brand";
import { grantWhiteLabel } from "@/lib/white-label/service";
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

const isPdf = (bytes: Uint8Array) =>
  new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" && bytes.length > 1500;

let owner: Actor;
let client: Actor;
let stranger: Actor;
let slug: string;
let projectId: string;
let orgId: string;
let clientId: string;

async function issuedInvoice(amount = 1_000_000) {
  const invoice = await createInvoice(owner, slug, {
    title: "Website, first half",
    items: [{ description: "Design and build", quantity: 1, unitAmount: amount }],
    notes: "Thank you.",
  });
  await transitionInvoice(owner, slug, invoice.id, "issue");
  return invoice.id;
}

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  stranger = await createUser("Stranger");
  slug = await project(owner, "Website redesign");
  const access = await loadProjectAccess(owner, { slug }, "project:read");
  projectId = access.project.id;
  orgId = access.project.organizationId;
  const c = await createClient(owner, {
    name: "PT ABC",
    company: "ABC Group",
    email: "client@abc.test",
    phone: "0812-3456-7890",
  });
  clientId = c.id;
  await setProjectClient(owner, slug, { clientId, portalEnabled: true, currency: "IDR" });
  const { url } = await createInvitation(owner, clientId, { email: "client@abc.test" });
  client = await createUser("Budi", "client@abc.test");
  await acceptInvitation(client, url.split("/invite/")[1]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("PDF files", () => {
  it("builds an invoice, a receipt and a signed contract as real PDF files", async () => {
    const invoiceId = await issuedInvoice();
    const { receiptId } = await recordPayment(owner, slug, invoiceId, {
      amount: 400_000,
      paidAt: "2026-10-01",
      method: "bank_transfer",
      reference: "BCA-1",
    });
    const invoice = await buildInvoicePdf(invoiceId, "id");
    expect(isPdf(invoice.bytes)).toBe(true);
    expect(invoice.filename).toMatch(/^INV-\d{4}-001\.pdf$/);
    const receipt = await buildReceiptPdf(receiptId, "en");
    expect(isPdf(receipt.bytes)).toBe(true);
    expect(receipt.filename).toMatch(/^KWT-\d{4}-001\.pdf$/);

    await generateBusinessDocument(owner, slug, { kind: "agreement" }, "id");
    await setDocumentStatus(owner, slug, { docSlug: "agreement", status: "approved" });
    await setDocumentClientVisible(owner, slug, { docSlug: "agreement", visible: true });
    await signAsTeam(owner, slug, "agreement");
    const [{ id: documentId }] = await db.query.documents.findMany({
      where: (d, { eq: same }) => same(d.slug, "agreement"),
    });
    const contract = await buildDocumentPdf(documentId, "id");
    expect(isPdf(contract.bytes)).toBe(true);
  });

  it("carries the agency's brand, logo included, while white label is open", async () => {
    const platform = await createUser("Platform");
    await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, platform.id));
    await grantWhiteLabel(platform, {
      organizationId: orgId,
      basis: "agreement",
      reference: "AGR-2026-001",
      validUntil: "",
    });
    await saveBrand(owner, {
      brandName: "Studio Biru",
      legalName: "PT Studio Biru Digital",
      taxNumber: "01.234.567.8-901.000",
      address: "Jl. Merdeka 1",
      accentColor: "#1f6feb",
      emailFromName: "Studio Biru",
      replyTo: "",
    });
    // A real 40x40 PNG, so the PDF library can draw it.
    const logo = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAGUlEQVR4nGP4z8Dwn5aYYdTAUQNHDRw1cHAaCADd3jPzYm7dBQAAAABJRU5ErkJggg==",
      "base64",
    );
    await saveLogo(owner, new Uint8Array(logo));
    const invoiceId = await issuedInvoice();
    const file = await buildInvoicePdf(invoiceId, "en");
    expect(isPdf(file.bytes)).toBe(true);
  });
});

describe("who may download a file", () => {
  it("lets the team and the client read what they can already see, and nobody else", async () => {
    const invoiceId = await issuedInvoice();
    const { receiptId } = await recordPayment(owner, slug, invoiceId, {
      amount: 100_000,
      paidAt: "2026-10-01",
      method: "cash",
      reference: "",
    });
    await generateBusinessDocument(owner, slug, { kind: "proposal" }, "en");
    const doc = (await db.query.documents.findMany())[0];

    for (const who of [owner, client]) {
      expect(await code(authorizePdf(who, "invoice", invoiceId))).toBe("OK");
      expect(await code(authorizePdf(who, "receipt", receiptId))).toBe("OK");
    }
    // A draft proposal is internal: the team reads it, the client does not.
    expect(await code(authorizePdf(owner, "document", doc.id))).toBe("OK");
    expect(await code(authorizePdf(client, "document", doc.id))).toBe("NOT_FOUND");
    await setDocumentStatus(owner, slug, { docSlug: "proposal", status: "approved" });
    await setDocumentClientVisible(owner, slug, { docSlug: "proposal", visible: true });
    expect(await code(authorizePdf(client, "document", doc.id))).toBe("OK");

    for (const kind of ["invoice", "receipt", "document"] as const) {
      const id = { invoice: invoiceId, receipt: receiptId, document: doc.id }[kind];
      expect(await code(authorizePdf(stranger, kind, id))).toBe("NOT_FOUND");
      expect(await code(authorizePdf(owner, kind, "not-a-uuid"))).toBe("NOT_FOUND");
      expect(await code(authorizePdf(owner, kind, crypto.randomUUID()))).toBe("NOT_FOUND");
    }
  });

  it("keeps a draft invoice and a voided receipt from the client", async () => {
    const draft = await createInvoice(owner, slug, {
      title: "Draft",
      items: [{ description: "x", quantity: 1, unitAmount: 1000 }],
    });
    expect(await code(authorizePdf(owner, "invoice", draft.id))).toBe("OK");
    expect(await code(authorizePdf(client, "invoice", draft.id))).toBe("NOT_FOUND");

    const invoiceId = await issuedInvoice();
    const { receiptId } = await recordPayment(owner, slug, invoiceId, {
      amount: 100_000,
      paidAt: "2026-10-01",
      method: "cash",
      reference: "",
    });
    await db.update(receipts).set({ voidedAt: new Date() }).where(eq(receipts.id, receiptId));
    expect(await code(authorizePdf(owner, "receipt", receiptId))).toBe("OK");
    expect(await code(authorizePdf(client, "receipt", receiptId))).toBe("NOT_FOUND");
  });
});

describe("mail to the client", () => {
  const sent: Record<string, unknown>[] = [];
  beforeEach(() => {
    sent.length = 0;
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "Saqina Dev <no-reply@saqina.test>");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        sent.push(JSON.parse(init.body));
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("attaches the invoice PDF when an invoice is issued, and the receipt PDF for a payment", async () => {
    const invoiceId = await issuedInvoice();
    const invoiceMail = sent.find((m) => m.to === "client@abc.test");
    const [invoiceFile] = (invoiceMail?.attachments ?? []) as {
      filename: string;
      content: string;
    }[];
    expect(invoiceFile.filename).toMatch(/^INV-\d{4}-001\.pdf$/);
    expect(Buffer.from(invoiceFile.content, "base64").subarray(0, 5).toString()).toBe("%PDF-");

    sent.length = 0;
    await recordPayment(owner, slug, invoiceId, {
      amount: 100_000,
      paidAt: "2026-10-01",
      method: "cash",
      reference: "",
    });
    const [receiptFile] = (sent[0]?.attachments ?? []) as { filename: string; content: string }[];
    expect(receiptFile.filename).toMatch(/^KWT-\d{4}-001\.pdf$/);
  });

  it("still sends the mail when the file cannot be built", async () => {
    const invoiceId = await issuedInvoice();
    sent.length = 0;
    const pdf = await import("@/lib/pdf/build");
    const spy = vi.spyOn(pdf, "buildReceiptPdf").mockRejectedValue(new Error("boom"));
    await recordPayment(owner, slug, invoiceId, {
      amount: 100_000,
      paidAt: "2026-10-01",
      method: "cash",
      reference: "",
    });
    spy.mockRestore();
    expect(sent).toHaveLength(1);
    expect(sent[0].attachments).toBeUndefined();
  });
});

describe("reminders by WhatsApp", () => {
  async function overdueInvoice() {
    const today = todayIso();
    await setPaymentSchedule(owner, slug, {
      value: 10_000_000,
      terms: [{ label: "DP", percentBp: 10_000, dueDate: addDays(today, -10) }],
    });
    const [term] = await listTerms(projectId);
    const { id } = await createInvoice(owner, slug, { termId: term.id });
    await transitionInvoice(owner, slug, id, "issue");
    return id;
  }

  const whatsappRows = () =>
    db.select().from(notificationDeliveries).where(eq(notificationDeliveries.channel, "whatsapp"));

  it("sends nothing unless the rule asks for it, then once per reminder to the client's phone", async () => {
    await overdueInvoice();
    await runReminders();
    expect(await whatsappRows()).toHaveLength(0);

    await db.delete(notificationDeliveries);
    const rules = await orgRules(orgId);
    for (const rule of rules.filter((r) => r.kind === "invoice_overdue"))
      await setRuleWhatsapp(owner, { id: rule.id, whatsapp: true });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    // The earlier run already claimed the day's slot, so clear the log to send again.
    await db.execute(sql`delete from reminder_log`);
    await runReminders();
    const rows = await whatsappRows();
    expect(rows.map((r) => r.status)).toEqual(["sent"]);
    const printed = info.mock.calls.flat().join(" ");
    expect(printed).toContain("[whatsapp]");
    expect(printed).not.toContain("3456");
    info.mockRestore();
  });

  it("skips and records a client without a usable number", async () => {
    await db.update(clients).set({ phone: "call me maybe" }).where(eq(clients.id, clientId));
    await overdueInvoice();
    for (const rule of (await orgRules(orgId)).filter((r) => r.kind === "invoice_overdue"))
      await setRuleWhatsapp(owner, { id: rule.id, whatsapp: true });
    await runReminders();
    const rows = await whatsappRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "skipped", error: "no_phone" });
  });

  it("changes a rule only for someone who can write billing, and only in their organization", async () => {
    const [rule] = await orgRules(orgId);
    expect(await code(setRuleWhatsapp(stranger, { id: rule.id, whatsapp: true }))).not.toBe("OK");
    expect((await orgRules(orgId)).find((r) => r.id === rule.id)?.whatsapp).toBe(false);
  });
});
