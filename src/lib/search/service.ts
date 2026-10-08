import "server-only";
import { and, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import {
  decisions,
  documents,
  memories,
  projectMembers,
  projects,
  requirements,
  tasks,
} from "@/lib/db/schema";

export type SearchKind = "project" | "requirement" | "document" | "task" | "memory" | "decision";

export interface SearchHit {
  /** Row id, unique per kind. */
  id: string;
  kind: SearchKind;
  title: string;
  projectSlug: string;
  projectName: string;
  /** Workspace path relative to /project/[slug]. */
  path: string;
}

const LIMIT_PER_KIND = 5;

/** Escapes LIKE wildcards so "100%" matches literally. */
const pattern = (query: string) => `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * First version of search: case-insensitive substring match over the user's own projects.
 * The interface (query in, typed hits out) stays when full-text search replaces it.
 */
export async function search(actor: Actor, rawQuery: string): Promise<SearchHit[]> {
  const query = rawQuery.trim().slice(0, 100);
  if (query.length < 2) return [];
  const like = pattern(query);
  // Membership scopes every query; there is no path to another user's data.
  const member = and(eq(projectMembers.userId, actor.id), isNull(projects.archivedAt));

  const scoped = async <T extends PgTable & { projectId: PgColumn; id: PgColumn }>(
    table: T,
    title: PgColumn,
    match: SQL | undefined,
    kind: SearchKind,
    path: (row: { title: string }) => string,
  ): Promise<SearchHit[]> => {
    const rows = await db
      .select({
        id: table.id,
        title: title,
        projectSlug: projects.slug,
        projectName: projects.name,
      })
      .from(table as PgTable)
      .innerJoin(projects, eq(projects.id, table.projectId))
      .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
      .where(and(member, match))
      .limit(LIMIT_PER_KIND);
    return rows.map((r) => ({
      id: String(r.id),
      kind,
      title: String(r.title),
      projectSlug: r.projectSlug,
      projectName: r.projectName,
      path: path({ title: String(r.title) }),
    }));
  };

  const projectRows = await db
    .select({ id: projects.id, name: projects.name, slug: projects.slug })
    .from(projects)
    .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(and(member, or(ilike(projects.name, like), ilike(projects.description, like))))
    .limit(LIMIT_PER_KIND);

  const groups = await Promise.all([
    scoped(
      requirements,
      requirements.title,
      or(ilike(requirements.title, like), ilike(requirements.description, like)),
      "requirement",
      () => "/requirements",
    ),
    scoped(
      documents,
      documents.title,
      or(ilike(documents.title, like), ilike(documents.content, like)),
      "document",
      () => "/documents",
    ),
    scoped(
      tasks,
      tasks.title,
      or(ilike(tasks.title, like), ilike(tasks.description, like)),
      "task",
      () => "/tasks",
    ),
    scoped(
      memories,
      memories.title,
      or(ilike(memories.title, like), ilike(memories.content, like)),
      "memory",
      () => "/memory",
    ),
    scoped(
      decisions,
      decisions.question,
      or(ilike(decisions.question, like), ilike(decisions.reason, like)),
      "decision",
      () => "/decisions",
    ),
  ]);

  return [
    ...projectRows.map((p) => ({
      id: p.id,
      kind: "project" as const,
      title: p.name,
      projectSlug: p.slug,
      projectName: p.name,
      path: "",
    })),
    ...groups.flat(),
  ];
}
