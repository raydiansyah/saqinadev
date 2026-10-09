import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { createInvoice, transitionInvoice } from "@/lib/billing/invoices";
import { recordPayment, voidPayment } from "@/lib/billing/payments";
import { projectBilling } from "@/lib/billing/summary";
import { listTerms, setPaymentSchedule } from "@/lib/billing/terms";
import { acceptInvitation, createInvitation, previewInvitation } from "@/lib/clients/invitations";
import { createClient, setProjectClient } from "@/lib/clients/service";
import { db } from "@/lib/db/client";
import {
  auditEvents,
  clientInvitations,
  documents,
  invoices,
  organizations,
  projects,
} from "@/lib/db/schema";
import { setDocumentClientVisible, setDocumentStatus } from "@/lib/documents/service";
import { AppError } from "@/lib/errors";
import { activeOrg } from "@/lib/organizations/service";
import { loadClientProjectAccess, portalProjects } from "@/lib/portal/access";
import {
  clientActivity,
  clientDocuments,
  clientInvoice,
  clientInvoices,
  clientPayments,
  clientProjectView,
  clientScope,
} from "@/lib/portal/views";
import { createScopeItem, listScope } from "@/lib/scope/service";
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

const tokenOf = (url: string) => url.split("/invite/")[1];

/** Owner with a project, a client and an invited portal user who accepted. */
async function setup(ownerName = "Owner", clientEmail = "client@abc.test") {
  const owner = await createUser(ownerName);
  const slug = await project(owner, "A restaurant point of sale app for my cafe with stock.");
  const client = await createClient(owner, { name: "PT ABC", email: clientEmail });
  await setProjectClient(owner, slug, {
    clientId: client.id,
    portalEnabled: true,
    currency: "IDR",
  });
  const { url } = await createInvitation(owner, client.id, { email: clientEmail });
  const portalUser: Actor = await createUser("Budi", clientEmail);
  await acceptInvitation(portalUser, tokenOf(url));
  return { owner, slug, client, portalUser };
}

describe("organizations", () => {
  beforeEach(resetDatabase);

  it("creates a personal organization lazily and puts projects in it", async () => {
    const owner = await createUser();
    const slug = await project(owner, "An online store that sells handmade batik clothes.");
    const { org } = await activeOrg(owner);
    expect(org.personal).toBe(true);
    const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
    expect(p.organizationId).toBe(org.id);
    expect(p.currency).toBe("IDR");
    const orgs = await db.select().from(organizations).where(eq(organizations.ownerId, owner.id));
    expect(orgs).toHaveLength(1);
  });
});

describe("client invitations", () => {
  beforeEach(resetDatabase);

  it("works once, for the invited email only, and can be revoked or expire", async () => {
    const owner = await createUser();
    const client = await createClient(owner, { name: "PT ABC" });
    const { url, emailed } = await createInvitation(owner, client.id, { email: "a@abc.test" });
    expect(emailed).toBe(false);
    const token = tokenOf(url);
    expect((await previewInvitation(token)).state).toBe("valid");

    const stranger = await createUser("Stranger");
    expect(await code(acceptInvitation(stranger, token))).toBe("AUTHORIZATION_ERROR");

    const invited = await createUser("A", "a@abc.test");
    expect(await code(acceptInvitation(invited, token))).toBe("OK");
    expect(await code(acceptInvitation(invited, token))).toBe("CONFLICT");
    expect((await previewInvitation(token)).state).toBe("used");

    const second = await createInvitation(owner, client.id, { email: "b@abc.test" });
    await db
      .update(clientInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(clientInvitations.email, "b@abc.test"));
    expect((await previewInvitation(tokenOf(second.url))).state).toBe("expired");

    // Only the hash is stored.
    const rows = await db.select().from(clientInvitations);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect((await previewInvitation("nope")).state).toBe("invalid");
  });

  it("does not let another organization manage the client", async () => {
    const owner = await createUser();
    const other = await createUser("Other");
    const client = await createClient(owner, { name: "PT ABC" });
    expect(await code(createInvitation(other, client.id, { email: "x@y.test" }))).toBe("NOT_FOUND");
  });
});

describe("billing", () => {
  beforeEach(resetDatabase);

  it("runs schedule, invoice, payment and void with exact totals", async () => {
    const owner = await createUser();
    const slug = await project(owner, "A restaurant point of sale app for my cafe with stock.");
    await setPaymentSchedule(owner, slug, {
      value: 25_000_000,
      terms: [
        { label: "DP", percentBp: 4000, dueDate: "2026-01-10" },
        { label: "Termin 2", percentBp: 3000 },
        { label: "Final", percentBp: 3000 },
      ],
    });
    const access = await loadProjectAccess(owner, { slug }, "billing:read");
    const terms = await listTerms(access.project.id);
    expect(terms.map((t) => t.amount)).toEqual([10_000_000, 7_500_000, 7_500_000]);

    const { id } = await createInvoice(owner, slug, { termId: terms[0].id });
    expect(await code(createInvoice(owner, slug, { termId: terms[0].id }))).toBe("CONFLICT");
    expect(await code(recordPayment(owner, slug, id, pay(1)))).toBe("CONFLICT");
    await transitionInvoice(owner, slug, id, "issue");

    expect(await code(recordPayment(owner, slug, id, pay(10_000_001)))).toBe("VALIDATION_ERROR");
    await recordPayment(owner, slug, id, pay(4_000_000));
    let billing = await projectBilling(access.project);
    expect(billing.invoices[0]).toMatchObject({ status: "overdue", amountPaid: 4_000_000 });
    expect(billing.totals).toMatchObject({
      invoiced: 10_000_000,
      paid: 4_000_000,
      outstanding: 6_000_000,
    });

    const { id: paymentId } = await recordPayment(owner, slug, id, pay(6_000_000));
    billing = await projectBilling(access.project);
    expect(billing.invoices[0].status).toBe("paid");
    expect(await code(transitionInvoice(owner, slug, id, "cancel"))).toBe("CONFLICT");

    // Changing the schedule keeps the invoiced DP.
    expect(
      await code(
        setPaymentSchedule(owner, slug, {
          value: 25_000_000,
          terms: [{ label: "Rest", percentBp: 5000 }],
        }),
      ),
    ).toBe("VALIDATION_ERROR");
    await setPaymentSchedule(owner, slug, {
      value: 25_000_000,
      terms: [{ label: "Rest", percentBp: 6000 }],
    });
    expect((await listTerms(access.project.id)).map((t) => t.label)).toEqual(["DP", "Rest"]);

    await voidPayment(owner, slug, paymentId, { reason: "Entered twice" });
    billing = await projectBilling(access.project);
    expect(billing.invoices[0]).toMatchObject({ amountPaid: 4_000_000 });
    expect(billing.ledger.map((l) => l.status).sort()).toEqual(["confirmed", "void"]);
    const audits = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.type, "payment.voided"));
    expect(audits).toHaveLength(1);
  });

  it("numbers invoices uniquely under concurrent issues", async () => {
    const owner = await createUser();
    const slug = await project(owner, "A restaurant point of sale app for my cafe with stock.");
    const ids = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        createInvoice(owner, slug, {
          title: `Item ${i}`,
          items: [{ description: "Work", quantity: 1, unitAmount: 1000 }],
        }).then((r) => r.id),
      ),
    );
    await Promise.all(ids.map((id) => transitionInvoice(owner, slug, id, "issue")));
    const rows = await db.select({ number: invoices.number }).from(invoices);
    const numbers = rows.map((r) => r.number);
    expect(new Set(numbers).size).toBe(6);
    expect(numbers.every((n) => /^INV-\d{4}-00[1-6]$/.test(n ?? ""))).toBe(true);
  });

  it("keeps billing away from editors and outsiders", async () => {
    const owner = await createUser();
    const outsider = await createUser("Outsider");
    const slug = await project(owner, "A restaurant point of sale app for my cafe with stock.");
    expect(await code(setPaymentSchedule(outsider, slug, { value: 1000, terms: [] }))).toBe(
      "NOT_FOUND",
    );
  });
});

const pay = (amount: number) => ({
  amount,
  paidAt: "2026-01-05",
  method: "bank_transfer",
  reference: "TRX-1",
});

describe("client portal isolation", () => {
  beforeEach(resetDatabase);

  it("shows only shared, client-safe data of the client's own projects", async () => {
    const a = await setup("Owner A", "a@abc.test");
    const b = await setup("Owner B", "b@xyz.test");

    // Client A sees its project, not B's, and never passes the internal guard.
    expect((await portalProjects(a.portalUser)).map((r) => r.project.slug)).toEqual([a.slug]);
    expect(await code(loadClientProjectAccess(a.portalUser, b.slug))).toBe("NOT_FOUND");
    expect(await code(loadProjectAccess(a.portalUser, { slug: a.slug }, "project:read"))).toBe(
      "NOT_FOUND",
    );

    // Scope: hidden items stay hidden. Documents: only approved and shared.
    await createScopeItem(a.owner, a.slug, { title: "Payment gateway", category: "excluded" });
    await createScopeItem(a.owner, a.slug, {
      title: "Internal admin tooling",
      category: "included",
      clientVisible: false,
    });
    const access = await loadClientProjectAccess(a.portalUser, a.slug);
    expect((await clientScope(access)).map((s) => s.title)).toEqual(["Payment gateway"]);
    expect(await listScope(access.project.id)).toHaveLength(2);

    expect(
      await code(setDocumentClientVisible(a.owner, a.slug, { docSlug: "prd", visible: true })),
    ).toBe("VALIDATION_ERROR");
    await setDocumentStatus(a.owner, a.slug, { docSlug: "prd", status: "approved" });
    await setDocumentClientVisible(a.owner, a.slug, { docSlug: "prd", visible: true });
    expect((await clientDocuments(access)).map((d) => d.slug)).toEqual(["prd"]);
    await setDocumentStatus(a.owner, a.slug, { docSlug: "prd", status: "review" });
    expect(await clientDocuments(access)).toHaveLength(0);
    const [prd] = await db.select().from(documents).where(eq(documents.slug, "prd"));
    expect(prd).toBeDefined();

    // Invoices: drafts are internal; issued ones and confirmed payments are visible.
    const draft = await createInvoice(a.owner, a.slug, {
      title: "Draft",
      items: [{ description: "x", quantity: 1, unitAmount: 500 }],
    });
    expect(await clientInvoices(access)).toHaveLength(0);
    expect(await code(clientInvoice(access, draft.id))).toBe("NOT_FOUND");
    await transitionInvoice(a.owner, a.slug, draft.id, "issue");
    await recordPayment(a.owner, a.slug, draft.id, pay(500));
    expect((await clientInvoices(access))[0]).toMatchObject({ status: "paid", balance: 0 });
    expect(await clientPayments(access)).toHaveLength(1);
    expect((await clientActivity(access)).map((x) => x.kind)).toEqual([
      "payment_received",
      "invoice_issued",
    ]);

    // B's invoice cannot be read through A's access.
    const bInvoice = await createInvoice(b.owner, b.slug, {
      title: "B invoice",
      items: [{ description: "y", quantity: 1, unitAmount: 900 }],
    });
    await transitionInvoice(b.owner, b.slug, bInvoice.id, "issue");
    expect(await code(clientInvoice(access, bInvoice.id))).toBe("NOT_FOUND");

    // Whitelisted views carry no internal fields.
    const serialized = JSON.stringify([
      await clientProjectView(access),
      await clientScope(access),
      await clientInvoices(access),
      await clientPayments(access),
      await clientActivity(access),
    ]);
    for (const key of [
      "internalNotes",
      "clientVisible",
      "ownerId",
      "organizationId",
      "agent",
      "model",
      "provider",
      "repository",
      "metadata",
      "reference",
      "recordedBy",
    ])
      expect(serialized).not.toContain(key);

    // Disabling the portal closes it.
    await setProjectClient(a.owner, a.slug, {
      clientId: a.client.id,
      portalEnabled: false,
      currency: "IDR",
    });
    expect(await code(loadClientProjectAccess(a.portalUser, a.slug))).toBe("NOT_FOUND");
  });

  it("locks the currency once an invoice exists", async () => {
    const a = await setup();
    await createInvoice(a.owner, a.slug, {
      title: "One",
      items: [{ description: "x", quantity: 1, unitAmount: 100 }],
    });
    expect(
      await code(
        setProjectClient(a.owner, a.slug, {
          clientId: a.client.id,
          portalEnabled: true,
          currency: "USD",
        }),
      ),
    ).toBe("CONFLICT");
  });
});
