import "server-only";
import { eq, inArray, notInArray } from "drizzle-orm";
import { activeEmbeddingModelId, type EmbedderOverride, embedTexts } from "@/lib/ai/embeddings";
import { db } from "@/lib/db/client";
import { memoryEmbeddings, projectSettings } from "@/lib/db/schema";
import { log } from "@/lib/log";
import { type EmbedSource, listEmbeddableSources, stillEligible } from "./sources";

/** Texts per provider call, and per job run. A project with more is finished by a follow-up job. */
export const EMBED_BATCH = 64;
export const EMBED_PER_RUN = 256;

export interface ReconcileResult {
  embedded: number;
  removed: number;
  /** Texts still waiting after this run. */
  remaining: number;
  skipped?: "no_model";
}

const keyOf = (kind: "asset" | "chunk", id: string) => `${kind}:${id}`;

/**
 * Makes the stored vectors match what may be embedded now: adds missing ones, replaces those whose
 * text changed, deletes those of another model, of a source that is gone or no longer eligible
 * (made private, archived, expired). Idempotent: a second run with nothing changed calls no provider.
 */
export async function reconcileProject(
  projectId: string,
  options: {
    override?: EmbedderOverride;
    signal?: AbortSignal;
    /** Smaller limits for a test; the defaults are EMBED_BATCH and EMBED_PER_RUN. */
    limits?: { batch?: number; perRun?: number };
  } = {},
): Promise<ReconcileResult> {
  const [settings] = await db
    .select({ on: projectSettings.semanticSearchEnabled })
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId));
  if (!settings?.on) {
    log.info("memory.embed.stopped_consent", { projectId });
    return { embedded: 0, removed: await deleteVectors(projectId), remaining: 0 };
  }
  const modelId = options.override?.modelId ?? (await activeEmbeddingModelId());
  // The Owner chose "None": no model can read the old vectors, so they are not kept.
  if (!modelId)
    return {
      embedded: 0,
      removed: await deleteVectors(projectId),
      remaining: 0,
      skipped: "no_model",
    };

  const batchSize = options.limits?.batch ?? EMBED_BATCH;
  const perRun = options.limits?.perRun ?? EMBED_PER_RUN;
  const sources = await listEmbeddableSources(projectId);
  const existing = await db
    .select({
      id: memoryEmbeddings.id,
      assetId: memoryEmbeddings.assetId,
      chunkId: memoryEmbeddings.chunkId,
      modelId: memoryEmbeddings.modelId,
      contentHash: memoryEmbeddings.contentHash,
    })
    .from(memoryEmbeddings)
    .where(eq(memoryEmbeddings.projectId, projectId));

  const wanted = new Set(sources.map((s) => keyOf(s.kind, s.id)));
  const sourceKey = (e: (typeof existing)[number]) =>
    e.assetId ? keyOf("asset", e.assetId) : keyOf("chunk", e.chunkId as string);
  const stale = existing.filter((e) => e.modelId !== modelId || !wanted.has(sourceKey(e)));
  if (stale.length > 0)
    await db.delete(memoryEmbeddings).where(
      inArray(
        memoryEmbeddings.id,
        stale.map((e) => e.id),
      ),
    );

  const have = new Map(
    existing
      .filter((e) => e.modelId === modelId)
      .map((e) => [sourceKey(e), e.contentHash] as const),
  );
  const todo = sources.filter((s) => have.get(keyOf(s.kind, s.id)) !== s.hash);
  const slice = todo.slice(0, perRun);

  let embedded = 0;
  for (let i = 0; i < slice.length; i += batchSize) {
    // Consent and eligibility are read again right before the text leaves. A window remains: an
    // asset can still change between this check and the moment the request leaves the server.
    // Retrieval re-checks visibility on every query, and store() re-checks before writing.
    const batch = await sendable(projectId, slice.slice(i, i + batchSize));
    if (batch === "off") {
      log.info("memory.embed.stopped_consent", { projectId });
      return { embedded, removed: stale.length, remaining: 0 };
    }
    if (batch.length === 0) continue;
    const out = await embedTexts({
      projectId,
      texts: batch.map((b) => b.text),
      signal: options.signal,
      override: options.override,
    });
    embedded += await store(projectId, out.modelId, batch, out.vectors);
  }
  log.info("memory.embed.reconciled", {
    projectId,
    embedded,
    removed: stale.length,
    remaining: todo.length - slice.length,
  });
  return { embedded, removed: stale.length, remaining: todo.length - slice.length };
}

async function deleteVectors(projectId: string): Promise<number> {
  const gone = await db
    .delete(memoryEmbeddings)
    .where(eq(memoryEmbeddings.projectId, projectId))
    .returning({ id: memoryEmbeddings.id });
  return gone.length;
}

/**
 * The part of a batch that may be sent now, or "off" when the project withdrew consent. Uses the
 * same eligibility filter as store(), so there is one definition of what may leave.
 */
async function sendable(projectId: string, batch: EmbedSource[]): Promise<EmbedSource[] | "off"> {
  const [settings] = await db
    .select({ on: projectSettings.semanticSearchEnabled })
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId));
  if (!settings?.on) return "off";
  const ok = await stillEligible(db, projectId, {
    assets: batch.filter((s) => s.kind === "asset").map((s) => s.id),
    chunks: batch.filter((s) => s.kind === "chunk").map((s) => s.id),
  });
  return batch.filter((s) => (s.kind === "asset" ? ok.assets : ok.chunks).has(s.id));
}

/**
 * Writes one batch. The provider call took time, so consent and eligibility are read again here,
 * inside the transaction: a project that withdrew consent, or an asset that became private,
 * expired or was archived, gets no vector. The share lock on the settings row serialises with
 * the update in setSemanticSearch. Returns how many vectors were written.
 */
async function store(
  projectId: string,
  modelId: string,
  batch: EmbedSource[],
  vectors: number[][],
): Promise<number> {
  return db.transaction(async (tx) => {
    const [settings] = await tx
      .select({ on: projectSettings.semanticSearchEnabled })
      .from(projectSettings)
      .where(eq(projectSettings.projectId, projectId))
      .for("share");
    if (!settings?.on) return 0;
    const ok = await stillEligible(tx, projectId, {
      assets: batch.filter((s) => s.kind === "asset").map((s) => s.id),
      chunks: batch.filter((s) => s.kind === "chunk").map((s) => s.id),
    });
    let written = 0;
    for (const [index, source] of batch.entries()) {
      if (!(source.kind === "asset" ? ok.assets : ok.chunks).has(source.id)) continue;
      const row = { contentHash: source.hash, embedding: vectors[index], createdAt: new Date() };
      // An upsert on the unique index: a changed text replaces its vector, and two parallel
      // reconciles cannot collide.
      await tx
        .insert(memoryEmbeddings)
        .values({
          projectId,
          modelId,
          ...row,
          assetId: source.kind === "asset" ? source.id : null,
          chunkId: source.kind === "chunk" ? source.id : null,
        })
        .onConflictDoUpdate({
          target:
            source.kind === "asset"
              ? [memoryEmbeddings.assetId, memoryEmbeddings.modelId]
              : [memoryEmbeddings.chunkId, memoryEmbeddings.modelId],
          set: row,
        });
      written++;
    }
    return written;
  });
}

/**
 * Deletes every vector of a project that has not opted in (switched off, or no settings row).
 * A safety net next to setSemanticSearch(false): nothing else would remove a row that a run
 * wrote around a withdrawal of consent.
 */
export async function sweepDisabledEmbeddings(): Promise<number> {
  const optedIn = db
    .select({ id: projectSettings.projectId })
    .from(projectSettings)
    .where(eq(projectSettings.semanticSearchEnabled, true));
  const gone = await db
    .delete(memoryEmbeddings)
    .where(notInArray(memoryEmbeddings.projectId, optedIn))
    .returning({ id: memoryEmbeddings.id });
  return gone.length;
}
