import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { createInvoice, transitionInvoice } from "@/lib/billing/invoices";
import { addDays, todayIso } from "@/lib/billing/rules";
import { listTerms, setPaymentSchedule } from "@/lib/billing/terms";
import { acceptInvitation, createInvitation } from "@/lib/clients/invitations";
import { createClient, setProjectClient } from "@/lib/clients/service";
import { db } from "@/lib/db/client";
import { documents, notifications, reminderLog } from "@/lib/db/schema";
import { generateBusinessDocument } from "@/lib/documents/business";
import { setDocumentClientVisible, setDocumentStatus } from "@/lib/documents/service";
import { signAsClient, signAsTeam } from "@/lib/documents/signing";
import { AppError } from "@/lib/errors";
import { createPlan, renewPlan, setWarranty } from "@/lib/maintenance/service";
import { listNotifications } from "@/lib/notifications/service";
import { loadClientProjectAccess } from "@/lib/portal/access";
import { clientMaintenance } from "@/lib/portal/engagement-views";
import { sendClientReminder } from "@/lib/reminders/manual";
import { runReminders } from "@/lib/reminders/service";
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

let owner: Actor;
let client: Actor;
let slug: string;

async function setup(email = "client@abc.test") {
  owner = await createUser("Owner");
  slug = await project(owner, "Cafe point of sale");
  const c = await createClient(owner, { name: "PT ABC", email });
  await setProjectClient(owner, slug, { clientId: c.id, portalEnabled: true, currency: "IDR" });
  const { url } = await createInvitation(owner, c.id, { email });
  client = await createUser("Budi", email);
  await acceptInvitation(client, url.split("/invite/")[1]);
  return (await loadProjectAccess(owner, { slug }, "project:read")).project;
}

describe("maintenance and reminders", () => {
  beforeEach(resetDatabase);

  it("renews plans and shows them on the portal", async () => {
    await setup();
    const today = todayIso();
    await setWarranty(owner, slug, { warrantyUntil: addDays(today, 30) });
    const plan = await createPlan(owner, slug, {
      name: "Monthly care",
      startDate: today,
      endDate: addDays(today, 10),
      fee: 1_500_000,
      cycle: "monthly",
    });
    await renewPlan(owner, slug, plan.id);
    const view = await clientMaintenance(await loadClientProjectAccess(client, slug));
    expect(view.plans.map((x) => x.status)).toEqual(["ended", "active"]);
    expect(view.warrantyUntil).toBe(addDays(today, 30));
  });

  it("runs reminders once per window and only for open items", async () => {
    await setup();
    const today = todayIso();
    await setPaymentSchedule(owner, slug, {
      value: 10_000_000,
      terms: [{ label: "DP", percentBp: 10_000, dueDate: addDays(today, -2) }],
    });
    const access = await loadProjectAccess(owner, { slug }, "billing:read");
    const [term] = await listTerms(access.project.id);
    const { id } = await createInvoice(owner, slug, { termId: term.id });
    await transitionInvoice(owner, slug, id, "issue");

    const first = await runReminders();
    expect(first.sent).toBe(1);
    const again = await runReminders();
    expect(again.sent).toBe(0);
    expect(await db.select().from(reminderLog)).toHaveLength(1);
    const types = (await listNotifications(client)).map((n) => n.type);
    expect(types).toContain("reminder.invoice_overdue");
    expect(types).toContain("invoice.issued");
    expect((await listNotifications(owner)).map((n) => n.type)).toContain(
      "reminder.invoice_overdue",
    );

    // Manual reminder: once per day.
    await sendClientReminder(owner, slug, { entityType: "invoice", entityId: id });
    expect(
      await code(sendClientReminder(owner, slug, { entityType: "invoice", entityId: id })),
    ).toBe("CONFLICT");
    expect(await db.select().from(notifications)).not.toHaveLength(0);
  });

  it("reminds about an agreement the client has not signed, once, until it is signed", async () => {
    await setup();
    await generateBusinessDocument(owner, slug, { kind: "agreement" }, "en");
    await setDocumentStatus(owner, slug, { docSlug: "agreement", status: "approved" });
    await setDocumentClientVisible(owner, slug, { docSlug: "agreement", visible: true });
    await signAsTeam(owner, slug, "agreement");

    // Just approved: nothing is due yet.
    expect((await runReminders()).sent).toBe(0);

    const old = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    await db.update(documents).set({ updatedAt: old }).where(eq(documents.slug, "agreement"));
    expect((await runReminders()).sent).toBe(1);
    expect((await runReminders()).sent).toBe(0);
    expect((await listNotifications(client)).map((n) => n.type)).toContain(
      "reminder.document_signature_pending",
    );

    await signAsClient(client, slug, "agreement");
    await db
      .update(documents)
      .set({ updatedAt: new Date(0) })
      .where(eq(documents.slug, "agreement"));
    expect((await runReminders()).sent).toBe(0);
  });
});

describe("business documents", () => {
  beforeEach(resetDatabase);

  it("generates drafts, regenerates with history and never touches signed ones", async () => {
    await setup();
    expect(await generateBusinessDocument(owner, slug, { kind: "proposal" }, "id")).toEqual({
      slug: "proposal",
      version: 1,
    });
    expect((await generateBusinessDocument(owner, slug, { kind: "proposal" }, "id")).version).toBe(
      2,
    );
    // Signed the real way: approved, shared, then signed by both parties.
    await setDocumentStatus(owner, slug, { docSlug: "proposal", status: "approved" });
    await setDocumentClientVisible(owner, slug, { docSlug: "proposal", visible: true });
    await signAsTeam(owner, slug, "proposal");
    await signAsClient(client, slug, "proposal");
    expect(await code(generateBusinessDocument(owner, slug, { kind: "proposal" }, "id"))).toBe(
      "CONFLICT",
    );
    const [doc] = await db.select().from(documents).where(eq(documents.slug, "proposal"));
    expect(doc.content).toContain("PT ABC");
    expect(doc.type).toBe("proposal");
  });
});
