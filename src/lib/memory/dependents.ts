import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import {
  memories,
  memoryAssets,
  memorySources,
  memoryVersions,
  projectChanges,
} from "@/lib/db/schema";
import { contentHash } from "./hash";
import { addVersion } from "./store";

/**
 * A fact leaves the shared context (deleted, archived, made private). Summaries built from it quote
 * its title, so each one loses that line, its older versions (which still contain it) are dropped,
 * its link to the fact is cut, and it goes back to review. Returns how many were changed.
 */
export async function redactDependents(
  tx: Tx,
  fact: { id: string; title: string },
  editedBy: string,
): Promise<number> {
  const links = await tx
    .select({ assetId: memorySources.assetId })
    .from(memorySources)
    .where(and(eq(memorySources.sourceType, "memory"), eq(memorySources.sourceId, fact.id)));
  for (const { assetId } of links) {
    const [row] = await tx
      .select({ asset: memoryAssets, memory: memories })
      .from(memoryAssets)
      .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
      .where(eq(memoryAssets.id, assetId));
    if (!row) continue;
    const content = row.memory.content
      .split("\n")
      .filter((line) => line.trim() !== `- ${fact.title}`.trim())
      .join("\n");
    const version = row.asset.version + 1;
    await tx
      .update(memoryAssets)
      .set({
        searchText: `${row.asset.title}\n${content}`,
        contentHash: contentHash(row.asset.title, content),
        version,
        status: row.asset.status === "approved" ? "pending_review" : row.asset.status,
      })
      .where(eq(memoryAssets.id, assetId));
    await tx.update(memories).set({ content }).where(eq(memories.id, row.memory.id));
    await tx
      .delete(memoryVersions)
      .where(and(eq(memoryVersions.assetId, assetId), lt(memoryVersions.version, version)));
    await addVersion(tx, {
      assetId,
      version,
      title: row.asset.title,
      content,
      editedBy,
      reason: "source removed",
    });
    await tx
      .delete(memorySources)
      .where(
        and(
          eq(memorySources.assetId, assetId),
          eq(memorySources.sourceType, "memory"),
          eq(memorySources.sourceId, fact.id),
        ),
      );
  }
  return links.length;
}

/** Titles live in the feed and the change outbox; once a memory is gone or private they go too. */
export async function scrubEventTitles(tx: Tx, projectId: string, memoryId: string) {
  await tx.execute(sql`
    update activities set metadata = metadata - 'title'
    where project_id = ${projectId} and entity_type = 'memory' and entity_id = ${memoryId}`);
  await tx
    .update(projectChanges)
    .set({ detail: sql`${projectChanges.detail} - 'title'` })
    .where(
      and(
        eq(projectChanges.projectId, projectId),
        eq(projectChanges.entityType, "memory"),
        eq(projectChanges.entityId, memoryId),
      ),
    );
}
