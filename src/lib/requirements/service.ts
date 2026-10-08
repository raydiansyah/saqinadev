import "server-only";
import { and, asc, eq, max } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { requirements } from "@/lib/db/schema";
import { PRIORITIES, REQUIREMENT_GROUPS, REQUIREMENT_STATUSES } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";

export type RequirementView = typeof requirements.$inferSelect;

export async function listRequirements(access: ProjectAccess): Promise<RequirementView[]> {
  return db
    .select()
    .from(requirements)
    .where(eq(requirements.projectId, access.project.id))
    .orderBy(asc(requirements.position), asc(requirements.createdAt));
}

const fields = {
  group: z.enum(REQUIREMENT_GROUPS),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000),
  priority: z.enum(PRIORITIES),
  status: z.enum(REQUIREMENT_STATUSES),
};
const createInput = z.object(fields);
const updateInput = z.object({ id: z.uuid(), ...fields });

/** Requirements written or edited by a person are always attributed to the user. */
export async function createRequirement(actor: Actor, slug: string, input: unknown) {
  const data = parse(createInput, input);
  return db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [{ last }] = await tx
      .select({ last: max(requirements.position) })
      .from(requirements)
      .where(eq(requirements.projectId, project.id));
    const [row] = await tx
      .insert(requirements)
      .values({
        projectId: project.id,
        ...data,
        source: "user",
        confidence: "high",
        position: (last ?? -1) + 1,
        updatedBy: actor.id,
      })
      .returning();
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "requirement.created",
      entityType: "requirement",
      entityId: row.id,
      metadata: { title: row.title },
    });
    return row;
  });
}

export async function updateRequirement(actor: Actor, slug: string, input: unknown) {
  const { id, ...data } = parse(updateInput, input);
  return db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [before] = await tx
      .select()
      .from(requirements)
      .where(and(eq(requirements.id, id), eq(requirements.projectId, project.id)));
    if (!before) throw new AppError("NOT_FOUND");
    const [row] = await tx
      .update(requirements)
      .set({ ...data, source: "user", confidence: "high", updatedBy: actor.id })
      .where(eq(requirements.id, id))
      .returning();
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "requirement.updated",
      entityType: "requirement",
      entityId: id,
      // What changed is kept on the event: who, what and when stay traceable.
      metadata: {
        title: row.title,
        ...(before.status !== row.status
          ? { fromStatus: before.status, toStatus: row.status }
          : {}),
        ...(before.priority !== row.priority
          ? { fromPriority: before.priority, toPriority: row.priority }
          : {}),
      },
    });
    return row;
  });
}

export async function deleteRequirement(actor: Actor, slug: string, input: unknown) {
  const { id } = parse(z.object({ id: z.uuid() }), input);
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [row] = await tx
      .delete(requirements)
      .where(and(eq(requirements.id, id), eq(requirements.projectId, project.id)))
      .returning({ title: requirements.title });
    if (!row) throw new AppError("NOT_FOUND");
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "requirement.deleted",
      entityType: "requirement",
      entityId: id,
      metadata: { title: row.title },
    });
  });
}
