/**
 * Development seed: one demo account with a client, a project, a payment schedule, two invoices
 * (one paid in part, one overdue), a shared proposal and a maintenance plan, created through the
 * same services the app uses. Demo projects are flagged (`projects.is_demo`) and
 * `pnpm db:seed --reset-demo` removes them without touching anyone else's data.
 *
 * Demo credentials (development only, never used in production):
 *   owner:  demo@saqina.test    / saqina-demo-2026
 *   client: client@saqina.test  / saqina-client-2026
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
import { clients, projects, users } from "../src/lib/db/schema";
import { generateBusinessDocument } from "../src/lib/documents/business";
import { setDocumentClientVisible, setDocumentStatus } from "../src/lib/documents/service";
import { createPlan, setWarranty } from "../src/lib/maintenance/service";
import { activeOrg } from "../src/lib/organizations/service";
import { createProject } from "../src/lib/projects/service";

const OWNER = { email: "demo@saqina.test", password: "saqina-demo-2026", name: "Demo Owner" };
const CLIENT = {
  email: "client@saqina.test",
  password: "saqina-client-2026",
  name: "Budi Santoso",
};
const CLIENT_COMPANY = "PT Rasa Nusantara";

async function account(who: typeof OWNER, platformRole?: "owner"): Promise<Actor> {
  let [user] = await db.select().from(users).where(eq(users.email, who.email));
  if (!user) {
    // Better Auth hashes the password; the account is marked verified so it can sign in.
    await auth.api.signUpEmail({ body: who });
    [user] = await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.email, who.email))
      .returning();
  }
  if (platformRole) await db.update(users).set({ platformRole }).where(eq(users.id, user.id));
  return { id: user.id, name: user.name, email: user.email, image: null };
}

async function resetDemo(owner: Actor) {
  const { org } = await activeOrg(owner);
  const removed = await db
    .delete(projects)
    .where(and(eq(projects.ownerId, owner.id), eq(projects.isDemo, true)))
    .returning({ slug: projects.slug });
  await db
    .delete(clients)
    .where(and(eq(clients.organizationId, org.id), eq(clients.name, CLIENT_COMPANY)));
  console.log(`Removed ${removed.length} demo projects`);
}

async function seedDemo(owner: Actor) {
  const client = await createClient(owner, {
    name: CLIENT_COMPANY,
    company: CLIENT_COMPANY,
    email: CLIENT.email,
    phone: "+62 812 0000 0000",
    internalNotes: "Pays by bank transfer, usually a few days late.",
  });
  const { slug } = await createProject(
    owner,
    { name: "Restaurant POS", description: "POS for a 40-seat restaurant.", clientId: client.id },
    "en",
  );
  await db.update(projects).set({ isDemo: true }).where(eq(projects.slug, slug));
  await setProjectClient(owner, slug, {
    clientId: client.id,
    portalEnabled: true,
    currency: "IDR",
  });
  const { url } = await createInvitation(owner, client.id, { email: CLIENT.email });
  await acceptInvitation(await account(CLIENT), url.split("/invite/")[1]);

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
  const overdue = await createInvoice(owner, slug, { termId: second.id });
  await transitionInvoice(owner, slug, overdue.id, "issue");
  await transitionInvoice(owner, slug, overdue.id, "send");

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
  const proposal = await generateBusinessDocument(owner, slug, { kind: "proposal" }, "en");
  await setDocumentStatus(owner, slug, { docSlug: proposal.slug, status: "approved" });
  await setDocumentClientVisible(owner, slug, { docSlug: proposal.slug, visible: true });
  return slug;
}

async function main() {
  const owner = await account(OWNER, "owner");
  if (process.argv.includes("--reset-demo")) {
    await resetDemo(owner);
    return;
  }
  await resetDemo(owner);
  const slug = await seedDemo(owner);
  console.log(`Seeded /project/${slug}`);
  console.log(`  owner:  ${OWNER.email} / ${OWNER.password}`);
  console.log(`  client: ${CLIENT.email} / ${CLIENT.password}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
