import "server-only";
import { createHash } from "node:crypto";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { memories, memoryAssets, memoryEmbeddings, wikiChunks, wikiSources } from "@/lib/db/schema";
import { notExpired } from "../scope";

/** One text is cut here: embedding models have an input limit, and the start of a memory carries its meaning. */
export const MAX_EMBED_CHARS = 6000;

export interface EmbedSource {
  kind: "asset" | "chunk";
  id: string;
  text: string;
  /** Hash of the exact text that is embedded. */
  hash: string;
}

export const embedHash = (text: string) => createHash("sha256").update(text).digest("hex");
const cut = (text: string) => text.slice(0, MAX_EMBED_CHARS);

/** Approved assets the whole project may read. Private, restricted and agent-only ones are never sent. */
export const assetFilter = (projectId: string, type: "chat" | "wiki") =>
  and(
    eq(memoryAssets.projectId, projectId),
    eq(memoryAssets.assetType, type),
    eq(memoryAssets.status, "approved"),
    eq(memoryAssets.visibility, "project"),
    notExpired(),
  );

/** Wiki passages of a ready source whose asset passes `assetFilter`. */
export const chunkFilter = (projectId: string) =>
  and(assetFilter(projectId, "wiki"), eq(wikiSources.status, "ready"));

/**
 * The text never leaves the database in full: it is cut in SQL. The JavaScript cut on the combined
 * string keeps the result at most MAX_EMBED_CHARS (left() counts characters, slice counts UTF-16 units).
 */
const head = (column: typeof memories.content | typeof wikiChunks.content) =>
  sql<string>`left(${column}, ${MAX_EMBED_CHARS})`;

export async function listEmbeddableSources(projectId: string): Promise<EmbedSource[]> {
  const chat = await db
    .select({ id: memoryAssets.id, title: memoryAssets.title, content: head(memories.content) })
    .from(memoryAssets)
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(assetFilter(projectId, "chat"));
  const wiki = await db
    .select({ id: wikiChunks.id, heading: wikiChunks.heading, content: head(wikiChunks.content) })
    .from(wikiChunks)
    .innerJoin(wikiSources, eq(wikiSources.id, wikiChunks.sourceId))
    .innerJoin(memoryAssets, eq(memoryAssets.id, wikiSources.assetId))
    .where(chunkFilter(projectId));
  const asset = chat.map((r): EmbedSource => {
    const text = cut(`${r.title}\n${r.content}`);
    return { kind: "asset", id: r.id, text, hash: embedHash(text) };
  });
  const chunk = wiki.map((r): EmbedSource => {
    const text = cut(`${r.heading}\n${r.content}`);
    return { kind: "chunk", id: r.id, text, hash: embedHash(text) };
  });
  return [...asset, ...chunk];
}

/** How many texts could be embedded, without loading them. */
export async function countEmbeddable(projectId: string): Promise<number> {
  const [chat] = await db
    .select({ n: count() })
    .from(memoryAssets)
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(assetFilter(projectId, "chat"));
  const [wiki] = await db
    .select({ n: count() })
    .from(wikiChunks)
    .innerJoin(wikiSources, eq(wikiSources.id, wikiChunks.sourceId))
    .innerJoin(memoryAssets, eq(memoryAssets.id, wikiSources.assetId))
    .where(chunkFilter(projectId));
  return (chat?.n ?? 0) + (wiki?.n ?? 0);
}

/**
 * Of these ids, the ones that are still eligible right now, read with a share lock on the asset row
 * so an owner who makes it private waits for the write that is in flight, and the next reconcile
 * removes what slipped through. Call it inside the transaction that writes the vectors.
 */
export async function stillEligible(
  tx: Executor,
  projectId: string,
  ids: { assets: string[]; chunks: string[] },
): Promise<{ assets: Set<string>; chunks: Set<string> }> {
  const assets =
    ids.assets.length === 0
      ? []
      : await tx
          .select({ id: memoryAssets.id })
          .from(memoryAssets)
          .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
          .where(and(assetFilter(projectId, "chat"), inArray(memoryAssets.id, ids.assets)))
          .for("share", { of: memoryAssets });
  const chunks =
    ids.chunks.length === 0
      ? []
      : await tx
          .select({ id: wikiChunks.id })
          .from(wikiChunks)
          .innerJoin(wikiSources, eq(wikiSources.id, wikiChunks.sourceId))
          .innerJoin(memoryAssets, eq(memoryAssets.id, wikiSources.assetId))
          .where(and(chunkFilter(projectId), inArray(wikiChunks.id, ids.chunks)))
          .for("share", { of: memoryAssets });
  return { assets: new Set(assets.map((r) => r.id)), chunks: new Set(chunks.map((r) => r.id)) };
}

export async function countEmbedded(projectId: string, modelId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(memoryEmbeddings)
    .where(and(eq(memoryEmbeddings.projectId, projectId), eq(memoryEmbeddings.modelId, modelId)));
  return row?.n ?? 0;
}
