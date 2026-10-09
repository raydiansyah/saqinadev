/**
 * Development seed: one demo account with four realistic projects, created through the same
 * services the app uses. Demo data is flagged (`projects.is_demo`) and can be removed with
 * `pnpm db:seed --reset-demo` without touching anyone else's data.
 *
 * Demo credentials (development only, never used in production):
 *   email:    demo@saqina.test
 *   password: saqina-demo-2026
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { handleMessage } from "../src/lib/assistant/service";
import type { Actor } from "../src/lib/auth/actor";
import { auth } from "../src/lib/auth/config";
import { db } from "../src/lib/db/client";
import { agents, projects, proposals, tasks, users } from "../src/lib/db/schema";
import { setDocumentStatus } from "../src/lib/documents/service";
import { completeInterview, saveAnswers } from "../src/lib/interviews/service";
import { startProject } from "../src/lib/projects/service";
import { approveProposal } from "../src/lib/proposals/service";
import { updateTask } from "../src/lib/tasks/service";
import { DEMO_CLIENT, resetDemoClient, seedBusiness } from "./seed-business";

const DEMO = { email: "demo@saqina.test", password: "saqina-demo-2026", name: "Demo Owner" };

async function demoActor(): Promise<Actor> {
  const [existing] = await db.select().from(users).where(eq(users.email, DEMO.email));
  if (existing) {
    await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, existing.id));
    return { id: existing.id, name: existing.name, email: existing.email, image: null };
  }
  // Better Auth hashes the password; the account is marked verified so it can sign in.
  await auth.api.signUpEmail({ body: DEMO });
  const [created] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, DEMO.email))
    .returning();
  // The demo account manages the AI control plane in development.
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, created.id));
  return { id: created.id, name: created.name, email: created.email, image: null };
}

async function resetDemo(actor: Actor) {
  const removed = await db
    .delete(projects)
    .where(and(eq(projects.ownerId, actor.id), eq(projects.isDemo, true)))
    .returning({ slug: projects.slug });
  console.log(`Removed ${removed.length} demo projects`);
}

async function restaurantPos(actor: Actor) {
  const { slug } = await startProject(
    actor,
    { idea: "A POS for a small restaurant with table orders, stock and daily sales reports." },
    "en",
    { isDemo: true },
  );
  await saveAnswers(actor, {
    slug,
    step: "review",
    confirm: ["projectType", "features", "audience"],
    patch: {
      projectType: "pos",
      audience: ["business-owners", "employees"],
      objective: "Manage sales, table orders and daily operations for a 40-seat restaurant.",
      features: ["auth", "pos", "inventory", "reports", "dashboard"],
      projectState: "new",
      techPreference: "recommend",
      databaseNeed: "yes",
      databaseChoice: "recommend",
      developmentMode: "saqina",
      deployment: "saqina-vercel",
      versioning: "yes",
      details: {
        platforms: ["web"],
        authMethods: ["google", "email"],
        followUps: { tableManagement: "yes", multiOutlet: "no" },
        constraints: "Staff use two shared Android tablets at the counter.",
        timeline: "months",
      },
    },
  });
  await completeInterview(actor, slug);
  const [first] = await db
    .select()
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(eq(projects.slug, slug))
    .limit(1);
  if (first) await updateTask(actor, slug, { id: first.tasks.id, status: "done" });
  return slug;
}

/** Sends a message the way the chat does and returns the proposal it produced, if any. */
async function say(
  actor: Actor,
  slug: string,
  content: string,
  extra: Record<string, unknown> = {},
) {
  let proposalId: string | null = null;
  let conversationId: string | null = null;
  await handleMessage(
    actor,
    slug,
    { clientId: randomUUID(), content, locale: "en", ...extra },
    (e) => {
      if (e.type === "started") conversationId = e.conversationId;
      if (e.type === "block" && e.block.type === "proposal") proposalId = e.block.proposalId;
    },
  );
  return {
    proposalId: proposalId as string | null,
    conversationId: conversationId as string | null,
  };
}

/**
 * Phase 3 demo state on the POS project: a refund proposal waiting for approval, a completed
 * simulated agent run, and a failed run on an agent that is not connected.
 */
async function restaurantAssistant(actor: Actor, slug: string) {
  const ask = await say(actor, slug, "Add a refund system.", { fresh: true });
  await say(actor, slug, "Always needs manager approval", { conversationId: ask.conversationId });

  const open = await db
    .select({ id: tasks.id, projectId: tasks.projectId })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(projects.slug, slug), eq(tasks.status, "todo")))
    .limit(2);
  const [first, second] = open;
  if (first) {
    const { proposalId } = await say(actor, slug, "Assign this task to an agent", {
      context: { type: "task", id: first.id },
      fresh: true,
    });
    if (proposalId) await approveProposal(actor, slug, { proposalId });
    const [result] = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(
        and(
          eq(proposals.projectId, first.projectId),
          eq(proposals.type, "agent_result"),
          eq(proposals.status, "pending"),
        ),
      );
    if (result) await approveProposal(actor, slug, { proposalId: result.id });
  }
  if (second) {
    const [claude] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.projectId, second.projectId), eq(agents.type, "claude")));
    const { proposalId } = await say(actor, slug, "Assign this task to an agent", {
      context: { type: "task", id: second.id },
      fresh: true,
    });
    if (proposalId && claude)
      await approveProposal(actor, slug, { proposalId, edits: { a1: { agentId: claude.id } } });
  }
}

async function marketplace(actor: Actor) {
  const { slug } = await startProject(
    actor,
    {
      idea: "A marketplace SaaS where local craftsmen sell handmade goods to buyers across Indonesia.",
    },
    "en",
    { isDemo: true },
  );
  // Interview left in progress on purpose: the dashboard shows "Continue Interview".
  await saveAnswers(actor, {
    slug,
    step: "followups",
    confirm: ["projectType"],
    patch: {
      audience: ["customers", "business-owners"],
      objective:
        "Let small workshops reach buyers outside their city without running their own shop.",
      features: ["auth", "search", "filter", "payment", "chat", "rbac"],
    },
  });
  return slug;
}

async function learningPlatform(actor: Actor) {
  const { slug } = await startProject(
    actor,
    { idea: "Platform kursus online untuk pelatihan barista dengan kuis dan sertifikat." },
    "id",
    { isDemo: true },
  );
  await saveAnswers(actor, {
    slug,
    step: "review",
    confirm: ["projectType", "features", "audience"],
    patch: {
      projectType: "learning-platform",
      audience: ["students", "teachers"],
      objective:
        "Melatih barista baru secara online dengan materi video, kuis, dan sertifikat kelulusan.",
      features: ["auth", "dashboard", "file-upload", "reports", "notification"],
      projectState: "new",
      techPreference: "recommend",
      databaseNeed: "yes",
      databaseChoice: "postgresql",
      developmentMode: "external",
      agent: "claude",
      deployment: "saqina-vercel",
      versioning: "yes",
      details: {
        platforms: ["web", "mobile"],
        authMethods: ["email"],
        followUps: { assessments: "yes", certificates: "yes", paidCourses: "no" },
        constraints: "",
        timeline: "months",
      },
    },
  });
  await completeInterview(actor, slug);
  await setDocumentStatus(actor, slug, { docSlug: "prd", status: "approved" });
  const list = await db
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(eq(projects.slug, slug))
    .limit(3);
  if (list[0]) await updateTask(actor, slug, { id: list[0].id, status: "done" });
  if (list[1]) await updateTask(actor, slug, { id: list[1].id, status: "in_progress" });
  if (list[2]) await updateTask(actor, slug, { id: list[2].id, status: "review" });
  return slug;
}

async function agencyPortfolio(actor: Actor) {
  const { slug } = await startProject(
    actor,
    { idea: "A portfolio site for an architecture studio showing built projects and the team." },
    "en",
    { isDemo: true },
  );
  await saveAnswers(actor, {
    slug,
    step: "review",
    confirm: ["projectType"],
    patch: {
      projectType: "portfolio",
      audience: ["public"],
      objective: "Win new residential commissions by showing finished work with photos and plans.",
      features: [],
      featuresUnknown: false,
      projectState: "new",
      techPreference: "recommend",
      developmentMode: "saqina",
      deployment: "saqina-vercel",
      details: {
        platforms: ["web"],
        authMethods: ["none"],
        followUps: {},
        constraints: "Photos are large; pages must stay fast on mobile.",
        timeline: "weeks",
      },
    },
  });
  await completeInterview(actor, slug);
  return slug;
}

async function main() {
  const actor = await demoActor();
  await resetDemo(actor);
  await resetDemoClient(actor);
  if (process.argv.includes("--reset-demo")) return;
  const pos = await restaurantPos(actor);
  await restaurantAssistant(actor, pos);
  await seedBusiness(actor, pos);
  const created = [
    pos,
    await marketplace(actor),
    await learningPlatform(actor),
    await agencyPortfolio(actor),
  ];
  console.log(
    `Seeded demo projects for ${DEMO.email}:\n${created.map((s) => `  /project/${s}`).join("\n")}\nClient portal: ${DEMO_CLIENT.email}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
