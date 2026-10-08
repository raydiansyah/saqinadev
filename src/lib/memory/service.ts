import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { memories } from "@/lib/db/schema";
import { MEMORY_CATEGORIES, type MemoryCategory } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";

export type MemoryView = typeof memories.$inferSelect;

/** Newest first. Filtering by category happens in the query so search can extend it later. */
export async function listMemories(
  access: ProjectAccess,
  category?: MemoryCategory,
): Promise<MemoryView[]> {
  return db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.projectId, access.project.id),
        category ? eq(memories.category, category) : undefined,
      ),
    )
    .orderBy(desc(memories.createdAt));
}

const fields = {
  title: z.string().trim().min(2).max(160),
  content: z.string().trim().min(1).max(4000),
  category: z.enum(MEMORY_CATEGORIES),
  importance: z.enum(["high", "normal"]).default("normal"),
};

export async function createMemory(
  actor: Actor,
  slug: string,
  input: unknown,
): Promise<MemoryView> {
  const data = parse(z.object(fields), input);
  return db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [row] = await tx
      .insert(memories)
      .values({ projectId: project.id, ...data, source: "user", createdBy: actor.id })
      .returning();
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "memory.created",
      entityType: "memory",
      entityId: row.id,
      metadata: { title: row.title, category: row.category },
    });
    return row;
  });
}

export async function updateMemory(
  actor: Actor,
  slug: string,
  input: unknown,
): Promise<MemoryView> {
  const { id, ...data } = parse(z.object({ id: z.uuid(), ...fields }), input);
  return db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [row] = await tx
      .update(memories)
      .set(data)
      .where(and(eq(memories.id, id), eq(memories.projectId, project.id)))
      .returning();
    if (!row) throw new AppError("NOT_FOUND");
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "memory.updated",
      entityType: "memory",
      entityId: id,
      metadata: { title: row.title },
    });
    return row;
  });
}
