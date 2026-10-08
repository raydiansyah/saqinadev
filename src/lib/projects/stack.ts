import "server-only";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { projectSettings, recommendations, repositoryConnections } from "@/lib/db/schema";
import type { TechStack } from "@/lib/db/schema/projects";
import { createDecisionTx } from "@/lib/decisions/service";
import { STACK_KEYS, type StackKey } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { type StackMismatch, stackMismatches } from "@/lib/git/stack";
import { parse } from "@/lib/validation";

/**
 * The project's technology, explicit: frontend, backend, database, auth, hosting, repository,
 * AI. Values the user set win over detected ones, which win over recommendations.
 */
export async function getTechStack(access: ProjectAccess): Promise<TechStack> {
  const [settings, recs, repo] = await Promise.all([
    db
      .select({ techStack: projectSettings.techStack })
      .from(projectSettings)
      .where(eq(projectSettings.projectId, access.project.id)),
    db.select().from(recommendations).where(eq(recommendations.projectId, access.project.id)),
    db
      .select({
        provider: repositoryConnections.provider,
        fullName: repositoryConnections.fullName,
        status: repositoryConnections.status,
      })
      .from(repositoryConnections)
      .where(eq(repositoryConnections.projectId, access.project.id)),
  ]);
  const rec = (key: string) => recs.find((r) => r.key === key)?.value.label;
  const stack: TechStack = {};
  const app = rec("application");
  if (app) {
    stack.frontend = { value: app.split("+")[0].trim(), source: "recommended" };
    if (/full-stack|full stack/i.test(rec("architecture") ?? ""))
      stack.backend = { value: stack.frontend.value, source: "recommended" };
  }
  const database = rec("database");
  if (database) stack.database = { value: database, source: "recommended" };
  const auth = rec("authentication");
  if (auth) stack.auth = { value: auth, source: "recommended" };
  const hosting = rec("deployment");
  if (hosting) stack.hosting = { value: hosting, source: "recommended" };
  if (repo[0] && repo[0].status !== "disconnected")
    stack.repository = { value: `${repo[0].provider}: ${repo[0].fullName}`, source: "detected" };
  return { ...stack, ...(settings[0]?.techStack ?? {}) };
}

const flat = (stack: TechStack) =>
  Object.fromEntries(Object.entries(stack).map(([k, v]) => [k, v?.value])) as Partial<
    Record<StackKey, string>
  >;

/** Mismatches between what the project intends and what the connected repository contains. */
export async function projectStackMismatches(access: ProjectAccess): Promise<StackMismatch[]> {
  const [repo] = await db
    .select({ detected: repositoryConnections.detectedStack, status: repositoryConnections.status })
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, access.project.id));
  if (!repo || repo.status !== "connected") return [];
  const stack = await getTechStack(access);
  // A difference the user already reviewed is not raised again.
  return stackMismatches(flat(stack), repo.detected).filter(
    (m) => stack[m.key]?.acknowledged !== m.repository,
  );
}

const updateInput = z.object({
  key: z.enum(STACK_KEYS),
  value: z.string().trim().max(120),
});

export async function updateTechStack(actor: Actor, slug: string, input: unknown) {
  const { key, value } = parse(updateInput, input);
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [row] = await tx
      .select({ techStack: projectSettings.techStack })
      .from(projectSettings)
      .where(eq(projectSettings.projectId, access.project.id));
    const techStack: TechStack = { ...(row?.techStack ?? {}) };
    if (value) techStack[key] = { value, source: "user" };
    else delete techStack[key];
    await tx
      .insert(projectSettings)
      .values({ projectId: access.project.id, techStack })
      .onConflictDoUpdate({ target: projectSettings.projectId, set: { techStack } });
    await recordActivity(tx, {
      projectId: access.project.id,
      actorId: actor.id,
      type: "stack.updated",
      entityType: "project",
      entityId: access.project.id,
      metadata: { title: key, value },
    });
  });
}

const resolveInput = z.object({ key: z.enum(STACK_KEYS), keep: z.enum(["project", "repository"]) });

/** The user decides which side is right; the choice is stored and recorded as a decision. */
export async function resolveStackMismatch(actor: Actor, slug: string, input: unknown) {
  const { key, keep } = parse(resolveInput, input);
  const access0 = await loadProjectAccess(actor, { slug }, "content:write");
  const mismatch = (await projectStackMismatches(access0)).find((m) => m.key === key);
  if (!mismatch) throw new AppError("NOT_FOUND");
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [row] = await tx
      .select({ techStack: projectSettings.techStack })
      .from(projectSettings)
      .where(eq(projectSettings.projectId, access.project.id));
    const chosen = keep === "repository" ? mismatch.repository : mismatch.project;
    const techStack: TechStack = {
      ...(row?.techStack ?? {}),
      [key]: {
        value: chosen,
        source: keep === "repository" ? "detected" : "user",
        acknowledged: mismatch.repository,
      },
    };
    await tx
      .insert(projectSettings)
      .values({ projectId: access.project.id, techStack })
      .onConflictDoUpdate({ target: projectSettings.projectId, set: { techStack } });
    await createDecisionTx(
      tx,
      access,
      {
        question: `Which ${key} does the project use?`,
        context: `Project plan said ${mismatch.project}; the repository uses ${mismatch.repository}.`,
        options: [mismatch.project, mismatch.repository],
        selected: chosen,
        reason:
          keep === "repository"
            ? "The existing repository is the source of truth."
            : "The project plan stays; the repository will be changed.",
      },
      { via: "user" },
    );
  });
}
