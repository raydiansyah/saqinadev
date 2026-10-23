import "server-only";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { requirements } from "@/lib/db/schema";
import {
  type AnswerSource,
  PRIORITIES,
  REQUIREMENT_GROUPS,
  REQUIREMENT_STATUSES,
} from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { type Trace, traceMetadata, USER_TRACE } from "@/lib/events/types";
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
export const createRequirementInput = z.object(fields);
export type CreateRequirementData = z.infer<typeof createRequirementInput>;
export const updateRequirementInput = z
  .object({ id: z.uuid(), ...fields })
  .partial()
  .required({
    id: true,
  });
export type UpdateRequirementData = z.infer<typeof updateRequirementInput>;

/**
 * Requirements written by a person are attributed to the user; assistant and agent changes
 * keep their own source so nobody mistakes them for something the user typed.
 */
const sourceFor = (trace: Trace): AnswerSource => trace.via;

export async function createRequirementTx(
  tx: Tx,
  access: ProjectAccess,
  data: CreateRequirementData,
  trace: Trace = USER_TRACE,
): Promise<RequirementView> {
  const { project, actor } = access;
  const [{ last }] = await tx
    .select({ last: max(requirements.position) })
    .from(requirements)
    .where(eq(requirements.projectId, project.id));
  const [row] = await tx
    .insert(requirements)
    .values({
      projectId: project.id,
      ...data,
      source: sourceFor(trace),
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
    metadata: { title: row.title, ...traceMetadata(trace) },
  });
  return row;
}

export async function updateRequirementTx(
  tx: Tx,
  access: ProjectAccess,
  { id, ...data }: UpdateRequirementData,
  trace: Trace = USER_TRACE,
): Promise<RequirementView> {
  const { project, actor } = access;
  const [before] = await tx
    .select()
    .from(requirements)
    .where(and(eq(requirements.id, id), eq(requirements.projectId, project.id)));
  if (!before) throw new AppError("NOT_FOUND");
  const [row] = await tx
    .update(requirements)
    .set({ ...data, source: sourceFor(trace), confidence: "high", updatedBy: actor.id })
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
      ...(before.status !== row.status ? { fromStatus: before.status, toStatus: row.status } : {}),
      ...(before.priority !== row.priority
        ? { fromPriority: before.priority, toPriority: row.priority }
        : {}),
      ...traceMetadata(trace),
    },
  });
  return row;
}

export async function deleteRequirementTx(
  tx: Tx,
  access: ProjectAccess,
  id: string,
  trace: Trace = USER_TRACE,
): Promise<{ title: string }> {
  const [row] = await tx
    .delete(requirements)
    .where(and(eq(requirements.id, id), eq(requirements.projectId, access.project.id)))
    .returning({ title: requirements.title });
  if (!row) throw new AppError("NOT_FOUND");
  await recordActivity(tx, {
    projectId: access.project.id,
    actorId: access.actor.id,
    type: "requirement.deleted",
    entityType: "requirement",
    entityId: id,
    metadata: { title: row.title, ...traceMetadata(trace) },
  });
  return row;
}

export async function createRequirement(actor: Actor, slug: string, input: unknown) {
  const data = parse(createRequirementInput, input);
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    return createRequirementTx(tx, access, data);
  });
}

export async function updateRequirement(actor: Actor, slug: string, input: unknown) {
  const data = parse(z.object({ id: z.uuid(), ...fields }), input);
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    return updateRequirementTx(tx, access, data);
  });
}

export async function deleteRequirement(actor: Actor, slug: string, input: unknown) {
  const { id } = parse(z.object({ id: z.uuid() }), input);
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    await deleteRequirementTx(tx, access, id);
  });
}

// ---- bulk ----------------------------------------------------------------------------------------

/** One request changes at most this many: a person selects them on one page. */
export const MAX_BULK = 200;

const bulkIds = z.array(z.uuid()).min(1).max(MAX_BULK);
const bulkPatch = z
  .object({
    status: z.enum(REQUIREMENT_STATUSES),
    priority: z.enum(PRIORITIES),
    group: z.enum(REQUIREMENT_GROUPS),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "empty");

/**
 * Sets a status, a priority or a group on many requirements at once. All or nothing: one id that
 * is not in this project (or a duplicate) refuses the whole request, so nobody learns which ids
 * belong to another project. One query, one activity entry for the whole change.
 */
export async function bulkUpdateRequirements(
  actor: Actor,
  slug: string,
  raw: unknown,
): Promise<{ updated: number }> {
  const { ids, patch } = parse(z.object({ ids: bulkIds, patch: bulkPatch }), raw);
  const unique = [...new Set(ids)];
  return db.transaction(async (tx) => {
    const { project, actor: who } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const rows = await tx
      .update(requirements)
      .set({ ...patch, source: USER_TRACE.via, confidence: "high", updatedBy: who.id })
      .where(and(eq(requirements.projectId, project.id), inArray(requirements.id, unique)))
      .returning({ id: requirements.id });
    if (rows.length !== unique.length) throw new AppError("NOT_FOUND");
    await recordActivity(tx, {
      projectId: project.id,
      actorId: who.id,
      type: "requirement.updated",
      entityType: "requirement",
      metadata: { count: rows.length, bulk: true, ...patch, ...traceMetadata(USER_TRACE) },
    });
    return { updated: rows.length };
  });
}

/** Deletes many requirements at once, under the same all-or-nothing rule. */
export async function bulkDeleteRequirements(
  actor: Actor,
  slug: string,
  raw: unknown,
): Promise<{ deleted: number }> {
  const { ids } = parse(z.object({ ids: bulkIds }), raw);
  const unique = [...new Set(ids)];
  return db.transaction(async (tx) => {
    const { project, actor: who } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const rows = await tx
      .delete(requirements)
      .where(and(eq(requirements.projectId, project.id), inArray(requirements.id, unique)))
      .returning({ id: requirements.id });
    if (rows.length !== unique.length) throw new AppError("NOT_FOUND");
    await recordActivity(tx, {
      projectId: project.id,
      actorId: who.id,
      type: "requirement.deleted",
      entityType: "requirement",
      metadata: { count: rows.length, bulk: true, ...traceMetadata(USER_TRACE) },
    });
    return { deleted: rows.length };
  });
}
