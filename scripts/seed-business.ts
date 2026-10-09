/**
 * Development seed for the business layer: a client with a portal account, scope, a payment
 * schedule, one paid and one overdue invoice, and a shared document on the POS demo project.
 *
 * Demo client portal account (development only, never used in production):
 *   email:    client@saqina.test
 *   password: saqina-client-2026
 */
import { and, eq } from "drizzle-orm";
import type { Actor } from "../src/lib/auth/actor";
import { auth } from "../src/lib/auth/config";
import { loadProjectAccess } from "../src/lib/auth/permissions";
import { createInvoice, transitionInvoice } from "../src/lib/billing/invoices";
import { recordPayment } from "../src/lib/billing/payments";
import { addDays, todayIso } from "../src/lib/billing/rules";
import { listTerms, setPaymentSchedule } from "../src/lib/billing/terms";
import { createChangeRequest, sendChangeRequest } from "../src/lib/change-requests/service";
import { acceptInvitation, createInvitation } from "../src/lib/clients/invitations";
import { createClient, setProjectClient } from "../src/lib/clients/service";
import { db } from "../src/lib/db/client";
import { clients, users } from "../src/lib/db/schema";
import { generateBusinessDocument } from "../src/lib/documents/business";
import { setDocumentClientVisible, setDocumentStatus } from "../src/lib/documents/service";
import { requestApproval } from "../src/lib/engagement/approvals";
import { clientPostMessage, teamPostMessage } from "../src/lib/engagement/messages";
import { clientCreateRequest } from "../src/lib/engagement/requests";
import { createPlan, setWarranty } from "../src/lib/maintenance/service";
import { activeOrg } from "../src/lib/organizations/service";
import { createScopeItem, seedScopeFromRequirements } from "../src/lib/scope/service";

export const DEMO_CLIENT = {
  email: "client@saqina.test",
  password: "saqina-client-2026",
  name: "Budi Santoso",
};
const CLIENT_NAME = "PT Rasa Nusantara";

async function clientAccount(): Promise<Actor> {
  let [user] = await db.select().from(users).where(eq(users.email, DEMO_CLIENT.email));
  if (!user) {
    await auth.api.signUpEmail({ body: DEMO_CLIENT });
    [user] = await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.email, DEMO_CLIENT.email))
      .returning();
  }
  return { id: user.id, name: user.name, email: user.email, image: null };
}

/** Removes the demo client (and its portal links) so the seed can run again. */
export async function resetDemoClient(owner: Actor) {
  const { org } = await activeOrg(owner);
  await db
    .delete(clients)
    .where(and(eq(clients.organizationId, org.id), eq(clients.name, CLIENT_NAME)));
}

export async function seedBusiness(owner: Actor, slug: string) {
  const client = await createClient(owner, {
    name: CLIENT_NAME,
    company: CLIENT_NAME,
    email: DEMO_CLIENT.email,
    phone: "+62 812 0000 0000",
    internalNotes: "Prefers WhatsApp for quick questions. Pays by bank transfer.",
  });
  await setProjectClient(owner, slug, {
    clientId: client.id,
    portalEnabled: true,
    currency: "IDR",
  });
  const { url } = await createInvitation(owner, client.id, { email: DEMO_CLIENT.email });
  const portalUser = await clientAccount();
  await acceptInvitation(portalUser, url.split("/invite/")[1]);

  await seedScopeFromRequirements(owner, slug);
  for (const title of ["Payment gateway", "Mobile application", "Hosting and domain"])
    await createScopeItem(owner, slug, { title, category: "excluded" });
  await createScopeItem(owner, slug, { title: "Multi-outlet support", category: "future" });

  const today = todayIso();
  await setPaymentSchedule(owner, slug, {
    value: 25_000_000,
    terms: [
      { label: "DP", percentBp: 4000, dueDate: addDays(today, -30) },
      { label: "Termin 2", percentBp: 3000, dueDate: addDays(today, -5) },
      { label: "Pelunasan", percentBp: 3000, dueDate: addDays(today, 30) },
    ],
  });
  const access = await loadProjectAccess(owner, { slug }, "billing:read");
  const [dp, second] = await listTerms(access.project.id);
  const dpInvoice = await createInvoice(owner, slug, { termId: dp.id });
  await transitionInvoice(owner, slug, dpInvoice.id, "issue");
  await transitionInvoice(owner, slug, dpInvoice.id, "send");
  await recordPayment(owner, slug, dpInvoice.id, {
    amount: 10_000_000,
    paidAt: addDays(today, -28),
    method: "bank_transfer",
    reference: "BCA 0928-DP",
  });
  const secondInvoice = await createInvoice(owner, slug, { termId: second.id });
  await transitionInvoice(owner, slug, secondInvoice.id, "issue");
  await transitionInvoice(owner, slug, secondInvoice.id, "send");

  await setDocumentStatus(owner, slug, { docSlug: "prd", status: "approved" });
  await setDocumentClientVisible(owner, slug, { docSlug: "prd", visible: true });

  // Phase 6: client engagement, a change request waiting for the client, maintenance.
  await clientCreateRequest(portalUser, slug, {
    kind: "feature",
    title: "Send receipts by WhatsApp",
    body: "Customers ask for the receipt on WhatsApp instead of paper.",
  });
  await clientPostMessage(portalUser, slug, { body: "Is the menu editor ready to try?" });
  await teamPostMessage(owner, slug, {
    body: "Yes, it is in the review build. We will ask for your approval this week.",
  });
  await requestApproval(owner, slug, {
    title: "Approve the PRD",
    description: "Please confirm the agreed features before development continues.",
    docSlug: "prd",
  });
  const cr = await createChangeRequest(owner, slug, {
    title: "WhatsApp receipts",
    description: "Send the receipt to the customer's WhatsApp number after payment.",
    impact: "Needs a WhatsApp Business API account. Adds one screen to the checkout flow.",
    additionalCost: 1_500_000,
    additionalDays: 3,
  });
  await sendChangeRequest(owner, slug, cr.id);
  await setWarranty(owner, slug, { warrantyUntil: addDays(today, 90) });
  await createPlan(owner, slug, {
    name: "Monthly care",
    startDate: addDays(today, 60),
    endDate: addDays(today, 60 + 364),
    fee: 1_500_000,
    cycle: "monthly",
    scope: "Bug fixes, small content changes, security updates.",
    excluded: "New features and integrations.",
    responseHours: 24,
  });
  await generateBusinessDocument(owner, slug, { kind: "proposal" }, "en");
}
