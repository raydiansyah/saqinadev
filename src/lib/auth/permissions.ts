import "server-only";
import { and, eq } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { db } from "@/lib/db/client";
import { projectMembers, projects } from "@/lib/db/schema";
import type { MemberRole } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import type { Actor } from "./actor";

export const PROJECT_ACTIONS = [
  "project:read",
  "project:update",
  "project:archive",
  "project:delete",
  "content:write",
  "members:manage",
] as const;
export type ProjectAction = (typeof PROJECT_ACTIONS)[number];

const ROLE_ACTIONS: Record<MemberRole, readonly ProjectAction[]> = {
  owner: PROJECT_ACTIONS,
  admin: ["project:read", "project:update", "project:archive", "content:write", "members:manage"],
  editor: ["project:read", "content:write"],
  viewer: ["project:read"],
};

/** Pure role check; the single source of truth for what each role may do. */
export function can(role: MemberRole, action: ProjectAction): boolean {
  return ROLE_ACTIONS[role].includes(action);
}

export interface ProjectAccess {
  actor: Actor;
  role: MemberRole;
  project: typeof projects.$inferSelect;
}

/**
 * Resolves user → membership → project in one query. A project the user is not a member of
 * is reported as NOT_FOUND, so its existence is not revealed.
 */
export async function loadProjectAccess(
  actor: Actor,
  by: { slug: string } | { id: string },
  action: ProjectAction,
  executor: Executor = db,
): Promise<ProjectAccess> {
  const [row] = await executor
    .select({ project: projects, role: projectMembers.role })
    .from(projects)
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.id)),
    )
    .where("slug" in by ? eq(projects.slug, by.slug) : eq(projects.id, by.id))
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND");
  if (!can(row.role, action)) throw new AppError("AUTHORIZATION_ERROR");
  return { actor, role: row.role, project: row.project };
}
