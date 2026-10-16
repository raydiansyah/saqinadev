import "server-only";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { memories, prdFindings, projectChanges } from "@/lib/db/schema";
import { listDocMap } from "@/lib/docmap/index-docs";

/**
 * What a reader (assistant, agent, MCP client, context package) needs to pick up a project
 * without scanning it: where the documents are, what is known, where the PRD disagrees, and what
 * changed since the revision the reader last saw. Cached per project revision: while nothing
 * changed, every reader gets the same object for free.
 */

export interface BrainChange {
  revision: number;
  type: string;
  entityType: string;
  entityId: string | null;
  origin: string | null;
  at: string;
  detail: Record<string, string | number | boolean | null> | null;
}

export interface ProjectBrain {
  revision: number;
  docMap: { path: string; role: string; classifiedBy: string }[];
  memory: { title: string; content: string; importance: string; source: string }[];
  prdFindings: { kind: string; subject: string }[];
  /** Present only when the reader says which revision it already knows. */
  since?: { revision: number; upToDate: boolean; changes: BrainChange[]; truncated: boolean };
}

const CHANGES_LIMIT = 100;
const MEMORY_LIMIT = 20;
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const cache = new Map<string, Omit<ProjectBrain, "since">>();
const CACHE_MAX = 100;

async function load(access: ProjectAccess): Promise<Omit<ProjectBrain, "since">> {
  const { id, contextRevision } = access.project;
  const key = `${id}:${contextRevision}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const [docMap, mem, findings] = await Promise.all([
    listDocMap(db, id),
    db
      .select()
      .from(memories)
      .where(eq(memories.projectId, id))
      // What matters most first, then the most recent.
      .orderBy(
        sql`case when ${memories.importance} = 'high' then 0 else 1 end`,
        desc(memories.updatedAt),
      )
      .limit(MEMORY_LIMIT),
    db
      .select({ kind: prdFindings.kind, subject: prdFindings.subject })
      .from(prdFindings)
      .where(and(eq(prdFindings.projectId, id), eq(prdFindings.status, "open")))
      .orderBy(asc(prdFindings.openedAtRevision))
      .limit(50),
  ]);
  const value = {
    revision: contextRevision,
    docMap: docMap.map((d) => ({ path: d.path, role: d.role, classifiedBy: d.classifiedBy })),
    memory: mem.map((m) => ({
      title: m.title,
      content: clip(m.content, 300),
      importance: m.importance,
      source: m.source,
    })),
    prdFindings: findings,
  };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
  return value;
}

/** Changes after `sinceRevision`, oldest first, capped. The reader asks again from the last one. */
export async function getChangesSince(
  access: ProjectAccess,
  sinceRevision: number,
): Promise<NonNullable<ProjectBrain["since"]>> {
  const rows = await db
    .select()
    .from(projectChanges)
    .where(
      and(
        eq(projectChanges.projectId, access.project.id),
        gt(projectChanges.revision, sinceRevision),
      ),
    )
    .orderBy(asc(projectChanges.revision))
    .limit(CHANGES_LIMIT + 1);
  const changes = rows.slice(0, CHANGES_LIMIT).map((c) => ({
    revision: c.revision,
    type: c.type,
    entityType: c.entityType,
    entityId: c.entityId,
    origin: c.origin,
    at: c.createdAt.toISOString(),
    detail: c.detail,
  }));
  return {
    revision: sinceRevision,
    upToDate: access.project.contextRevision <= sinceRevision,
    changes,
    truncated: rows.length > CHANGES_LIMIT,
  };
}

export async function getProjectBrain(
  access: ProjectAccess,
  options: { sinceRevision?: number } = {},
): Promise<ProjectBrain> {
  const base = await load(access);
  if (options.sinceRevision === undefined) return base;
  return { ...base, since: await getChangesSince(access, options.sinceRevision) };
}

/** The brain as markdown, for places that take text (context package, prompts). */
export function renderBrain(brain: ProjectBrain): string {
  const lines = [`# Project brain (revision ${brain.revision})`, ""];
  lines.push("## Document map", "");
  lines.push(
    ...(brain.docMap.length
      ? brain.docMap.map((d) => `- ${d.role}: ${d.path}`)
      : ["_No repository documents indexed._"]),
  );
  lines.push("", "## Where the PRD and the project disagree", "");
  lines.push(
    ...(brain.prdFindings.length
      ? brain.prdFindings.map((f) => `- ${f.kind.replaceAll("_", " ")}: ${f.subject}`)
      : ["_No open findings._"]),
  );
  lines.push("", "## Key memory", "");
  lines.push(
    ...(brain.memory.length
      ? brain.memory.map((m) => `- ${m.title}: ${m.content}`)
      : ["_Nothing recorded yet._"]),
  );
  return `${lines.join("\n")}\n`;
}
