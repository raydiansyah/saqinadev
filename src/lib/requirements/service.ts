import "server-only";
import { and, asc, eq, max } from "drizzle-orm";
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
