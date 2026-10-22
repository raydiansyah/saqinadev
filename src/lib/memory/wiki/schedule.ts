import "server-only";
import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { documents, projects, wikiSources } from "@/lib/db/schema";
import { enqueue } from "../queue";

/** Queues a read of the project's documents. The key makes the same request a single job. */
export function enqueueWikiSync(executor: Executor, projectId: string, key: string) {
  return enqueue(executor, {
    projectId,
    kind: "index_wiki",
    key: `wiki:${projectId}:${key}`,
    data: { projectId },
  });
}

/** A person asked for a fresh read: always a new job. */
export const requestWikiReindex = (projectId: string) =>
  enqueueWikiSync(db, projectId, `manual:${Date.now()}`);

/**
 * Safety net for the cron: projects that have documents to read but no wiki yet (they existed
 * before the wiki did, or their changes were never seen). Returns how many were queued.
 */
export async function enqueueWikiBackfill(max = 25): Promise<number> {
  const rows = await db
    .selectDistinct({ projectId: documents.projectId })
    .from(documents)
    .innerJoin(projects, eq(projects.id, documents.projectId))
    .where(
      and(
        inArray(documents.type, ["prd", "plan", "custom"]),
        sql`length(trim(${documents.content})) > 0`,
        notExists(
          db
            .select({ one: sql`1` })
            .from(wikiSources)
            .where(eq(wikiSources.projectId, documents.projectId)),
        ),
      ),
    )
    .limit(max);
  let queued = 0;
  for (const r of rows)
    if (await enqueueWikiSync(db, r.projectId, `backfill:${new Date().toISOString().slice(0, 10)}`))
      queued++;
  return queued;
}
