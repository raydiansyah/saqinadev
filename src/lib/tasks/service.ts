import "server-only";
import { and, asc, eq, max } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { milestones, projects, tasks } from "@/lib/db/schema";
import {
  PRIORITIES,
  type ProjectStatus,
  TASK_STATUSES,
  type TaskSource,
  type TaskStatus,
} from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { type Trace, traceMetadata, USER_TRACE } from "@/lib/events/types";
import { parse } from "@/lib/validation";

export type TaskView = typeof tasks.$inferSelect;
export type MilestoneView = typeof milestones.$inferSelect;

export async function listTasks(access: ProjectAccess): Promise<TaskView[]> {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, access.project.id))
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
}

export async function listMilestones(access: ProjectAccess): Promise<MilestoneView[]> {
  return db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, access.project.id))
    .orderBy(asc(milestones.position));
}

const STARTED: TaskStatus[] = ["in_progress", "review", "done"];
/** Project statuses that move to "building" once real work starts. */
const PRE_BUILD: ProjectStatus[] = ["planning", "ready"];

export const createTaskInput = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).default(""),
  priority: z.enum(PRIORITIES).default("medium"),
  status: z.enum(TASK_STATUSES).default("todo"),
  milestoneId: z.uuid().nullable().default(null),
});
export type CreateTaskData = z.infer<typeof createTaskInput>;

export const updateTaskInput = z.object({
  id: z.uuid(),
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  milestoneId: z.uuid().nullable().optional(),
});
export type UpdateTaskData = z.infer<typeof updateTaskInput>;

async function assertMilestone(tx: Tx, projectId: string, milestoneId: string | null | undefined) {
  if (!milestoneId) return;
  const [row] = await tx
    .select({ id: milestones.id })
    .from(milestones)
    .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)));
  if (!row) throw new AppError("VALIDATION_ERROR", "Unknown milestone", { milestoneId: "invalid" });
}

async function markBuilding(tx: Tx, projectId: string, status: ProjectStatus, next: TaskStatus) {
  if (STARTED.includes(next) && PRE_BUILD.includes(status)) {
    await tx.update(projects).set({ status: "building" }).where(eq(projects.id, projectId));
  }
}

const SOURCE_FOR: Record<Trace["via"], TaskSource> = {
  user: "user",
  assistant: "assistant",
  agent: "agent",
};

/**
 * Transaction-level create. The caller has already authorized `content:write` inside `tx`
 * and validated `data`; user, assistant and agent paths all end here.
 */
export async function createTaskTx(
  tx: Tx,
  access: ProjectAccess,
  data: CreateTaskData,
  trace: Trace = USER_TRACE,
): Promise<TaskView> {
  const { project, actor } = access;
  await assertMilestone(tx, project.id, data.milestoneId);
  const [{ last }] = await tx
    .select({ last: max(tasks.position) })
    .from(tasks)
    .where(eq(tasks.projectId, project.id));
  const [row] = await tx
    .insert(tasks)
    .values({
      projectId: project.id,
      ...data,
      source: SOURCE_FOR[trace.via],
      position: (last ?? -1) + 1,
      completedAt: data.status === "done" ? new Date() : null,
    })
    .returning();
  await markBuilding(tx, project.id, project.status, row.status);
  await recordActivity(tx, {
    projectId: project.id,
    actorId: actor.id,
    type: "task.created",
    entityType: "task",
    entityId: row.id,
    metadata: { title: row.title, ...traceMetadata(trace) },
  });
  return row;
}

/** Transaction-level update. completedAt follows the status. */
export async function updateTaskTx(
  tx: Tx,
  access: ProjectAccess,
  { id, ...patch }: UpdateTaskData,
  trace: Trace = USER_TRACE,
): Promise<TaskView> {
  const { project, actor } = access;
  const [before] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.projectId, project.id)));
  if (!before) throw new AppError("NOT_FOUND");
  await assertMilestone(tx, project.id, patch.milestoneId);

  const status = patch.status ?? before.status;
  const completedAt =
    status === "done" ? (before.status === "done" ? before.completedAt : new Date()) : null;
  const [row] = await tx
    .update(tasks)
    .set({ ...patch, completedAt })
    .where(eq(tasks.id, id))
    .returning();
  await markBuilding(tx, project.id, project.status, status);

  const type =
    before.status !== "done" && status === "done"
      ? "task.completed"
      : before.status === "done" && status !== "done"
        ? "task.reopened"
        : "task.updated";
  await recordActivity(tx, {
    projectId: project.id,
    actorId: actor.id,
    type,
    entityType: "task",
    entityId: id,
    metadata: {
      title: row.title,
      ...(before.status !== status ? { fromStatus: before.status, toStatus: status } : {}),
      ...traceMetadata(trace),
    },
  });
  return row;
}

/** Only reachable through an approved proposal; there is no direct delete in the UI. */
export async function deleteTaskTx(
  tx: Tx,
  access: ProjectAccess,
  id: string,
  trace: Trace,
): Promise<{ id: string; title: string }> {
  const [row] = await tx
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.projectId, access.project.id)))
    .returning({ id: tasks.id, title: tasks.title });
  if (!row) throw new AppError("NOT_FOUND");
  await recordActivity(tx, {
    projectId: access.project.id,
    actorId: access.actor.id,
    type: "task.deleted",
    entityType: "task",
    entityId: id,
    metadata: { title: row.title, ...traceMetadata(trace) },
  });
  return row;
}

export async function createTask(actor: Actor, slug: string, input: unknown): Promise<TaskView> {
  const data = parse(createTaskInput, input);
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    return createTaskTx(tx, access, data);
  });
}

/** Edits, moves, completes and reopens. */
export async function updateTask(actor: Actor, slug: string, input: unknown): Promise<TaskView> {
  const data = parse(updateTaskInput, input);
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    return updateTaskTx(tx, access, data);
  });
}

const milestoneInput = z.object({
  id: z.uuid(),
  title: z.string().trim().min(2).max(120),
  goal: z.string().trim().max(1000),
});

export async function updateMilestone(actor: Actor, slug: string, input: unknown) {
  const { id, ...data } = parse(milestoneInput, input);
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [row] = await tx
      .update(milestones)
      .set(data)
      .where(and(eq(milestones.id, id), eq(milestones.projectId, project.id)))
      .returning({ id: milestones.id });
    if (!row) throw new AppError("NOT_FOUND");
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "milestone.updated",
      entityType: "milestone",
      entityId: id,
      metadata: { title: data.title },
    });
  });
}
