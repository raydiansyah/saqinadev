import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { projectMembers, projectSettings, projects } from "@/lib/db/schema";

export type ProjectRow = typeof projects.$inferSelect;
export type ProjectSettingsRow = typeof projectSettings.$inferSelect;

/** Projects the user is a member of, most recently changed first. */
export async function listMemberProjects(
  executor: Executor,
  userId: string,
  options: { archived?: boolean } = {},
): Promise<ProjectRow[]> {
  return executor
    .select({ project: projects })
    .from(projects)
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)),
    )
    .where(options.archived ? undefined : isNull(projects.archivedAt))
    .orderBy(desc(projects.updatedAt))
    .then((rows) => rows.map((r) => r.project));
}

export async function slugExists(executor: Executor, slug: string): Promise<boolean> {
  const [row] = await executor
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  return !!row;
}

export async function getSettings(
  executor: Executor,
  projectId: string,
): Promise<ProjectSettingsRow | undefined> {
  const [row] = await executor
    .select()
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId));
  return row;
}
