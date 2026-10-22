import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db/client";
import { memoryAssets, repositoryConnections } from "@/lib/db/schema";
import { enqueue } from "../queue";

/**
 * What queues code indexing, kept apart from what runs it: pages, the git service and the cron only
 * ask for a job, and must not pull in the indexer and the TypeScript parser behind it.
 */

export const enqueueCodeIndex = (
  executor: Parameters<typeof enqueue>[0],
  input: { projectId: string; branch?: string | null; key: string },
) =>
  enqueue(executor, {
    projectId: input.projectId,
    kind: "index_code",
    key: `code:${input.projectId}:${input.key}`,
    data: { projectId: input.projectId, ...(input.branch ? { branch: input.branch } : {}) },
  });

/** A person asked for a fresh read: always a new job. */
export const requestCodeReindex = (projectId: string, branch?: string | null) =>
  enqueueCodeIndex(db, { projectId, branch, key: `manual:${Date.now()}` });

/** Everything derived from the repository goes with the connection. */
export async function purgeCodeIndexes(tx: Tx, projectId: string) {
  await tx
    .delete(memoryAssets)
    .where(and(eq(memoryAssets.projectId, projectId), eq(memoryAssets.assetType, "code")));
}

/**
 * Daily safety net: every project with a connected GitHub repository gets one job that does
 * nothing when the branch has not moved. Indexing is not push-driven yet.
 */
export async function enqueueCodeSweep(max = 25): Promise<number> {
  const rows = await db
    .select({ projectId: repositoryConnections.projectId })
    .from(repositoryConnections)
    .where(
      and(
        eq(repositoryConnections.provider, "github"),
        sql`${repositoryConnections.status} <> 'disconnected'`,
      ),
    )
    // Random, so a long list is covered over days rather than always starting with the same ones.
    .orderBy(sql`random()`)
    .limit(max);
  const day = new Date().toISOString().slice(0, 10);
  let queued = 0;
  for (const r of rows)
    if (await enqueueCodeIndex(db, { projectId: r.projectId, key: `sweep:${day}` })) queued++;
  return queued;
}
