import "server-only";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { activities, projectMembers, projects, users } from "@/lib/db/schema";
import type { ActivityType } from "@/lib/domain/enums";

export type ActivityMetadata = Record<string, string | number | boolean | null>;

export interface ActivityInput {
  projectId: string;
  actorId: string | null;
  type: ActivityType;
  entityType: string;
  entityId?: string | null;
  metadata?: ActivityMetadata;
}

const CONTEXT_TYPES = [
  "project",
  "interview",
  "requirement",
  "recommendation",
  "document",
  "task",
  "milestone",
  "memory",
  "decision",
  "stack",
];
const changesContext = (type: string) => CONTEXT_TYPES.includes(type.split(".")[0]);

let lastTick = 0;
const tick = () => {
  lastTick = Math.max(Date.now(), lastTick + 1);
  return new Date(lastTick);
};

/**
 * Records a meaningful project event inside the caller's transaction and bumps the
 * project's updatedAt, so "last updated" always matches the activity feed.
 */
export async function recordActivity(executor: Executor, input: ActivityInput): Promise<void> {
  await executor.insert(activities).values({
    projectId: input.projectId,
    actorId: input.actorId,
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? {},
    // now() is fixed for a whole transaction; a strictly increasing clock keeps events in order.
    createdAt: tick(),
  });
  await executor
    .update(projects)
    .set({
      updatedAt: new Date(),
      // Only changes to what agents read move the context version (not runs, tools, handoffs).
      ...(changesContext(input.type)
        ? { contextRevision: sql`${projects.contextRevision} + 1` }
        : {}),
    })
    .where(eq(projects.id, input.projectId));
}

export interface ActivityView {
  id: string;
  type: ActivityType;
  entityType: string;
  entityId: string | null;
  metadata: ActivityMetadata;
  actorName: string | null;
  createdAt: Date;
}

export const ACTIVITY_PAGE_SIZE = 20;

/**
 * Newest first, keyset-paginated by (createdAt, id). Callers must have checked access to
 * the project already; this only reads.
 */
export async function listActivity(
  projectId: string,
  options: { before?: { createdAt: Date; id: string }; limit?: number } = {},
): Promise<{ items: ActivityView[]; next: { createdAt: Date; id: string } | null }> {
  const limit = options.limit ?? ACTIVITY_PAGE_SIZE;
  const { before } = options;
  const rows = await db
    .select({
      id: activities.id,
      type: activities.type,
      entityType: activities.entityType,
      entityId: activities.entityId,
      metadata: activities.metadata,
      createdAt: activities.createdAt,
      actorName: users.name,
    })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.actorId))
    .where(
      and(
        eq(activities.projectId, projectId),
        before
          ? or(
              lt(activities.createdAt, before.createdAt),
              and(eq(activities.createdAt, before.createdAt), lt(activities.id, before.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(activities.createdAt), desc(activities.id))
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

export interface UserActivityView extends ActivityView {
  projectSlug: string;
  projectName: string;
}

/** Latest events across every project the user is a member of. */
export async function listRecentActivityForUser(
  userId: string,
  limit = 30,
): Promise<UserActivityView[]> {
  return db
    .select({
      id: activities.id,
      type: activities.type,
      entityType: activities.entityType,
      entityId: activities.entityId,
      metadata: activities.metadata,
      createdAt: activities.createdAt,
      actorName: users.name,
      projectSlug: projects.slug,
      projectName: projects.name,
    })
    .from(activities)
    .innerJoin(projects, eq(projects.id, activities.projectId))
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)),
    )
    .leftJoin(users, eq(users.id, activities.actorId))
    .orderBy(desc(activities.createdAt))
    .limit(limit);
}
