import "server-only";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Executor, type Tx } from "@/lib/db/client";
import { requirements, scopeItems } from "@/lib/db/schema";
import { SCOPE_CATEGORIES } from "@/lib/domain/business";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";

export type ScopeItem = typeof scopeItems.$inferSelect;

export async function listScope(projectId: string, executor: Executor = db): Promise<ScopeItem[]> {
  return executor
    .select()
    .from(scopeItems)
    .where(eq(scopeItems.projectId, projectId))
    .orderBy(asc(scopeItems.category), asc(scopeItems.position), asc(scopeItems.createdAt));
}

export const scopeItemInput = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).default(""),
  category: z.enum(SCOPE_CATEGORIES),
  clientVisible: z.boolean().default(true),
});

/** Inserts inside the caller's transaction (used by the assistant executor too). */
export async function createScopeItemTx(
  tx: Tx,
  access: Pick<ProjectAccess, "actor" | "project">,
  data: z.output<typeof scopeItemInput> & { requirementId?: string },
  metadata: Record<string, string> = {},
) {
  const [{ top }] = await tx
    .select({ top: max(scopeItems.position) })
    .from(scopeItems)
    .where(
      and(eq(scopeItems.projectId, access.project.id), eq(scopeItems.category, data.category)),
    );
  const [item] = await tx
    .insert(scopeItems)
    .values({
      ...data,
      projectId: access.project.id,
      position: (top ?? -1) + 1,
      createdBy: access.actor.id,
    })
    .returning();
  await recordActivity(tx, {
    projectId: access.project.id,
    actorId: access.actor.id,
    type: "scope.created",
    entityType: "scope_item",
    entityId: item.id,
    metadata: { title: item.title, category: item.category, ...metadata },
  });
  return item;
}

export async function createScopeItem(actor: Actor, slug: string, input: unknown) {
  const data = parse(scopeItemInput, input);
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    return createScopeItemTx(tx, access, data);
  });
}

export async function updateScopeItem(actor: Actor, slug: string, id: string, input: unknown) {
  const data = parse(scopeItemInput, input);
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [item] = await tx
      .update(scopeItems)
      .set(data)
      .where(and(eq(scopeItems.id, id), eq(scopeItems.projectId, project.id)))
      .returning({ id: scopeItems.id });
    if (!item) throw new AppError("NOT_FOUND");
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "scope.updated",
      entityType: "scope_item",
      entityId: id,
      metadata: { title: data.title, category: data.category },
    });
  });
}

export async function deleteScopeItem(actor: Actor, slug: string, id: string) {
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [item] = await tx
      .delete(scopeItems)
      .where(and(eq(scopeItems.id, id), eq(scopeItems.projectId, project.id)))
      .returning({ id: scopeItems.id, title: scopeItems.title });
    if (!item) throw new AppError("NOT_FOUND");
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "scope.deleted",
      entityType: "scope_item",
      entityId: id,
      metadata: { title: item.title },
    });
  });
}

/**
 * Seeds "Included" from the project's feature requirements that are not in scope yet.
 * Inferred requirements are copied too; the user reviews the list before sharing it.
 */
export async function seedScopeFromRequirements(actor: Actor, slug: string): Promise<number> {
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const reqs = await tx
      .select()
      .from(requirements)
      .where(
        and(
          eq(requirements.projectId, access.project.id),
          inArray(requirements.group, ["features", "integrations", "authentication"]),
          inArray(requirements.status, ["confirmed", "inferred"]),
        ),
      )
      .orderBy(asc(requirements.position));
    const existing = await listScope(access.project.id, tx);
    const known = new Set(existing.map((s) => s.requirementId).filter(Boolean));
    const titles = new Set(existing.map((s) => s.title.toLowerCase()));
    let added = 0;
    for (const r of reqs) {
      if (known.has(r.id) || titles.has(r.title.toLowerCase())) continue;
      await createScopeItemTx(
        tx,
        access,
        {
          title: r.title,
          description: r.description,
          category: "included",
          clientVisible: true,
          requirementId: r.id,
        },
        { source: "requirements" },
      );
      added += 1;
    }
    return added;
  });
}
