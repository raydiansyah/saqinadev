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
import { acceptInvitation, createInvitation } from "../src/lib/clients/invitations";
import { createClient, setProjectClient } from "../src/lib/clients/service";
import { db } from "../src/lib/db/client";
import { clients, users } from "../src/lib/db/schema";
import { setDocumentClientVisible, setDocumentStatus } from "../src/lib/documents/service";
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
  await acceptInvitation(await clientAccount(), url.split("/invite/")[1]);

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
}
