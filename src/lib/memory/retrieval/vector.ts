import "server-only";
import { and, cosineDistance, eq, type SQL, sql } from "drizzle-orm";
import { activeEmbeddingModelId, type EmbedderOverride, embedTexts } from "@/lib/ai/embeddings";
import { db } from "@/lib/db/client";
import {
  aiModels,
  aiProviders,
  memories,
  memoryAssets,
  memoryEmbeddings,
  projectSettings,
  wikiChunks,
  wikiSources,
} from "@/lib/db/schema";
import { countEmbeddable, countEmbedded } from "../embed/sources";

/** Nearest vectors taken per list, before fusion. */
export const VECTOR_LIMIT = 30;
/**
 * A vector farther than this (cosine distance) is not "similar", so it is not a candidate: the
 * nearest neighbour of an unrelated question must never push out the text matches. Tune with the
 * real model on real memories before release; the fake embedder in tests uses unit vectors.
 */
export const MAX_COSINE_DISTANCE = 0.6;
/** The question is embedded within this time; the retrieval budget as a whole is 1500 ms. */
export const QUERY_EMBED_MS = 900;

/** The embedding model's id when this project opted in and a model exists; otherwise null (semantic is off). */
export async function semanticModelFor(
  projectId: string,
  override?: EmbedderOverride,
): Promise<string | null> {
  const [settings] = await db
    .select({ on: projectSettings.semanticSearchEnabled })
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId));
  if (!settings?.on) return null;
  return override?.modelId ?? (await activeEmbeddingModelId());
}

export interface QueryVector {
  /** The model that made the vector, as embedTexts reports it: the only model it may be compared with. */
  modelId: string;
  vector: number[];
}

/**
 * Embeds the question for a project that opted in; null when semantic search is off. Throws when
 * the provider fails or does not answer within `ms`, even a provider that ignores the abort
 * signal, so the caller can degrade to the text lists instead of losing the whole budget.
 */
export async function embedQuery(
  projectId: string,
  query: string,
  override?: EmbedderOverride,
  ms = QUERY_EMBED_MS,
): Promise<QueryVector | null> {
  if (!(await semanticModelFor(projectId, override))) return null;
  const signal = AbortSignal.timeout(ms);
  const call = embedTexts({ projectId, texts: [query], signal, override });
  const out = await new Promise<Awaited<typeof call>>((resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    call.then(resolve, reject);
  });
  return { modelId: out.modelId, vector: out.vectors[0] };
}

/** The share of the retrieval budget the question's embedding may use; the text lists need the rest. */
export const queryEmbedMs = (timeoutMs: number) =>
  Math.min(QUERY_EMBED_MS, Math.floor(timeoutMs * 0.6));

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** Holds the outcome of a promise started early, so a rejection waits for its reader instead of going unhandled. */
export const settle = <T>(promise: Promise<T>): Promise<Settled<T>> =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

/** Reads a settled outcome back: the value, or the error thrown again. */
export async function unwrap<T>(settled: Promise<Settled<T>> | null): Promise<T | null> {
  if (!settled) return null;
  const out = await settled;
  if (!out.ok) throw out.error;
  return out.value;
}

/**
 * Ids of the nearest assets. `base` is the caller's access filter and is applied here, at query
 * time: a vector row never means the asset is readable.
 */
export async function nearestAssets(
  base: SQL | undefined,
  projectId: string,
  modelId: string,
  vector: number[],
): Promise<string[]> {
  const distance = cosineDistance(memoryEmbeddings.embedding, vector);
  const rows = await db
    .select({ id: memoryAssets.id })
    .from(memoryEmbeddings)
    .innerJoin(memoryAssets, eq(memoryAssets.id, memoryEmbeddings.assetId))
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(
      and(
        base,
        eq(memoryEmbeddings.projectId, projectId),
        eq(memoryEmbeddings.modelId, modelId),
        sql`${distance} < ${MAX_COSINE_DISTANCE}`,
      ),
    )
    .orderBy(distance)
    .limit(VECTOR_LIMIT);
  return rows.map((r) => r.id);
}

/** Ids of the nearest wiki chunks, under the wiki access filter (`base`), applied at query time. */
export async function nearestChunks(
  base: SQL | undefined,
  projectId: string,
  modelId: string,
  vector: number[],
): Promise<string[]> {
  const distance = cosineDistance(memoryEmbeddings.embedding, vector);
  const rows = await db
    .select({ id: wikiChunks.id })
    .from(memoryEmbeddings)
    .innerJoin(wikiChunks, eq(wikiChunks.id, memoryEmbeddings.chunkId))
    .innerJoin(wikiSources, eq(wikiSources.id, wikiChunks.sourceId))
    .innerJoin(memoryAssets, eq(memoryAssets.id, wikiSources.assetId))
    .where(
      and(
        base,
        eq(memoryEmbeddings.projectId, projectId),
        eq(memoryEmbeddings.modelId, modelId),
        sql`${distance} < ${MAX_COSINE_DISTANCE}`,
      ),
    )
    .orderBy(distance)
    .limit(VECTOR_LIMIT);
  return rows.map((r) => r.id);
}

/** Name of the provider that serves the embedding model (as the owner named it), or null. */
async function embeddingProviderName(modelId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: aiProviders.name })
    .from(aiModels)
    .innerJoin(aiProviders, eq(aiProviders.id, aiModels.providerId))
    .where(eq(aiModels.id, modelId));
  return row?.name ?? null;
}

/** What the Memory overview says: off, indexing (part of the project is embedded) or on. */
export async function getSemanticOverview(projectId: string) {
  const [settings] = await db
    .select({ on: projectSettings.semanticSearchEnabled })
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId));
  const modelId = await activeEmbeddingModelId();
  const enabled = Boolean(settings?.on);
  // The provider the text would go to, named in the consent dialog.
  const provider = modelId ? await embeddingProviderName(modelId) : null;
  if (!enabled || !modelId)
    return {
      state: "off" as const,
      enabled,
      modelConfigured: Boolean(modelId),
      provider,
      indexed: 0,
      total: 0,
    };
  const [total, indexed] = await Promise.all([
    countEmbeddable(projectId),
    countEmbedded(projectId, modelId),
  ]);
  return {
    state: indexed < total ? ("indexing" as const) : ("on" as const),
    enabled,
    modelConfigured: true,
    provider,
    indexed,
    total,
  };
}
