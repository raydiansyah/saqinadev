import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { createInvoice, transitionInvoice } from "@/lib/billing/invoices";
import { addDays, todayIso } from "@/lib/billing/rules";
import { listTerms, setPaymentSchedule } from "@/lib/billing/terms";
import {
  clientDecideChangeRequest,
  createChangeRequest,
  sendChangeRequest,
  teamRecordDecision,
} from "@/lib/change-requests/service";
import { acceptInvitation, createInvitation } from "@/lib/clients/invitations";
import { createClient, setProjectClient } from "@/lib/clients/service";
import { db } from "@/lib/db/client";
import {
  changeRequests,
  documents,
  notifications,
  projects,
  reminderLog,
  scopeItems,
  tasks,
} from "@/lib/db/schema";
import { generateBusinessDocument } from "@/lib/documents/business";
import { setDocumentStatus } from "@/lib/documents/service";
import { clientRespondApproval, requestApproval } from "@/lib/engagement/approvals";
import { clientPostMessage, teamPostMessage } from "@/lib/engagement/messages";
import { clientCreateRequest, listRequests, updateRequest } from "@/lib/engagement/requests";
import { AppError } from "@/lib/errors";
import { createPlan, renewPlan, setWarranty } from "@/lib/maintenance/service";
import { listNotifications, markRead, unreadCount } from "@/lib/notifications/service";
import { loadClientProjectAccess } from "@/lib/portal/access";
import {
  clientApprovalList,
  clientChangeRequestList,
  clientMaintenance,
  clientRequestList,
} from "@/lib/portal/engagement-views";
import { sendClientReminder } from "@/lib/reminders/manual";
import { runReminders } from "@/lib/reminders/service";
import { createScopeItem } from "@/lib/scope/service";
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
  slug = await project(owner, "A restaurant point of sale app for my cafe with stock.");
  const c = await createClient(owner, { name: "PT ABC", email });
  await setProjectClient(owner, slug, { clientId: c.id, portalEnabled: true, currency: "IDR" });
  const { url } = await createInvitation(owner, c.id, { email });
  client = await createUser("Budi", email);
  await acceptInvitation(client, url.split("/invite/")[1]);
  return (await loadProjectAccess(owner, { slug }, "project:read")).project;
}

describe("client engagement", () => {
  beforeEach(resetDatabase);

  it("routes requests, messages and approvals between client and team", async () => {
    const p = await setup();
    await createScopeItem(owner, slug, { title: "Payment gateway", category: "excluded" });

    await clientCreateRequest(client, slug, {
      kind: "feature",
      title: "Add payment gateway",
      body: "Customers want to pay online.",
    });
    const [req] = await listRequests(p.id);
    expect(req).toMatchObject({ side: "client", scopeStatus: "out_of_scope", status: "open" });
    expect(await unreadCount(owner)).toBe(1);

    await updateRequest(owner, slug, req.id, { status: "in_review" });
    const access = await loadClientProjectAccess(client, slug);
    expect((await clientRequestList(access))[0]).toMatchObject({ status: "in_review" });

    await teamPostMessage(owner, slug, { body: "We will send a change request." });
    await clientPostMessage(client, slug, { body: "Thanks!" });
    expect((await listNotifications(client)).map((n) => n.type)).toContain("message.posted");

    // Approvals: only for approved documents, and changes need a note.
    expect(await code(requestApproval(owner, slug, { title: "Review PRD", docSlug: "prd" }))).toBe(
      "VALIDATION_ERROR",
    );
    await setDocumentStatus(owner, slug, { docSlug: "prd", status: "approved" });
    const { id } = await requestApproval(owner, slug, { title: "Review PRD", docSlug: "prd" });
    expect((await clientApprovalList(access))[0]).toMatchObject({ documentSlug: "prd" });
    expect(
      await code(clientRespondApproval(client, slug, id, { decision: "changes_requested" })),
    ).toBe("VALIDATION_ERROR");
    await clientRespondApproval(client, slug, id, { decision: "approved" });
    expect(await code(clientRespondApproval(client, slug, id, { decision: "approved" }))).toBe(
      "NOT_FOUND",
    );

    await markRead(owner);
    expect(await unreadCount(owner)).toBe(0);
  });

  it("applies an approved change request to scope, tasks and billing exactly once", async () => {
    const p = await setup();
    await setPaymentSchedule(owner, slug, {
      value: 20_000_000,
      terms: [
        { label: "DP", percentBp: 5000 },
        { label: "Final", percentBp: 5000 },
      ],
    });
    const { id } = await createChangeRequest(owner, slug, {
      title: "WhatsApp integration",
      additionalCost: 1_500_000,
      additionalDays: 3,
    });
    const access = await loadClientProjectAccess(client, slug);
    // Drafts are internal.
    expect(await clientChangeRequestList(access)).toHaveLength(0);
    expect(await code(clientDecideChangeRequest(client, slug, id, { decision: "approved" }))).toBe(
      "CONFLICT",
    );
    await sendChangeRequest(owner, slug, id);
    expect((await clientChangeRequestList(access))[0]).toMatchObject({ additionalCost: 1_500_000 });

    // The team can only record a client's decision with evidence.
    expect(await code(teamRecordDecision(owner, slug, id, { decision: "approved" }))).toBe(
      "VALIDATION_ERROR",
    );
    await clientDecideChangeRequest(client, slug, id, { decision: "approved" });
    expect(await code(clientDecideChangeRequest(client, slug, id, { decision: "approved" }))).toBe(
      "CONFLICT",
    );

    const [cr] = await db.select().from(changeRequests).where(eq(changeRequests.id, id));
    expect(cr.status).toBe("approved");
    const terms = await listTerms(p.id);
    expect(terms.at(-1)).toMatchObject({ label: "CR-001", amount: 1_500_000 });
    const [after] = await db.select().from(projects).where(eq(projects.id, p.id));
    expect(after.value).toBe(21_500_000);
    expect(
      (await db.select().from(scopeItems).where(eq(scopeItems.projectId, p.id))).map(
        (s) => s.title,
      ),
    ).toContain("WhatsApp integration");
    expect((await db.select().from(tasks)).some((t) => t.title.startsWith("CR-001"))).toBe(true);
  });

  it("keeps another client out of engagement data", async () => {
    await setup("a@abc.test");
    const aSlug = slug;
    const aClient = client;
    await setup("b@xyz.test");
    expect(await code(clientCreateRequest(aClient, slug, { kind: "bug", title: "Broken" }))).toBe(
      "NOT_FOUND",
    );
    expect(await code(clientPostMessage(aClient, slug, { body: "hi" }))).toBe("NOT_FOUND");
    expect(await code(clientCreateRequest(client, aSlug, { kind: "bug", title: "Broken" }))).toBe(
      "NOT_FOUND",
    );
  });
});

describe("maintenance and reminders", () => {
  beforeEach(resetDatabase);

  it("classifies requests, renews plans and shows them on the portal", async () => {
    const p = await setup();
    const today = todayIso();
    await setWarranty(owner, slug, { warrantyUntil: addDays(today, 30) });
    const plan = await createPlan(owner, slug, {
      name: "Monthly care",
      startDate: today,
      endDate: addDays(today, 10),
      fee: 1_500_000,
      cycle: "monthly",
    });
    await clientCreateRequest(client, slug, { kind: "bug", title: "Logo broken on homepage" });
    const [req] = await listRequests(p.id);
    expect(req.suggestedClassification).toBe("warranty");
    expect(req.classification).toBe("unclassified");

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
    await setDocumentStatus(owner, slug, { docSlug: "proposal", status: "signed" });
    expect(await code(generateBusinessDocument(owner, slug, { kind: "proposal" }, "id"))).toBe(
      "CONFLICT",
    );
    const [doc] = await db.select().from(documents).where(eq(documents.slug, "proposal"));
    expect(doc.content).toContain("PT ABC");
    expect(doc.type).toBe("proposal");
  });
});
