import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiModels, aiProviders } from "@/lib/db/schema";
import { EMBEDDING_DIMENSIONS } from "@/lib/domain/memory";
import { AppError } from "@/lib/errors";
import { allow } from "@/lib/rate-limit";
import { ADAPTERS } from "./adapters";
import { AiProviderError } from "./adapters/http";
import { loadCatalog, platformSettings } from "./catalog";
import { recordUsage } from "./gateway";
import { embedderAllowed } from "./model-resolver";
import { type AiProvider, AiUnsupportedError } from "./provider";
import { usesNoKey, withProviderSecret } from "./provider-secret";

export type EmbeddingUnavailableReason = "no_model" | "unsupported" | "provider_unavailable";

/** Nothing can embed right now. The caller falls back to full-text search and says so. */
export class EmbeddingsUnavailable extends Error {
  constructor(readonly reason: EmbeddingUnavailableReason) {
    super(`embeddings_unavailable:${reason}`);
    this.name = "EmbeddingsUnavailable";
  }
}

/** Tests inject an embedder instead of a provider; `modelId` is a row of `ai_models`. */
export interface EmbedderOverride {
  modelId: string;
  embed(texts: readonly string[]): Promise<number[][]>;
}

export interface EmbedResult {
  vectors: number[][];
  modelId: string;
}

const isAbort = (error: unknown) =>
  ["AbortError", "TimeoutError"].includes((error as Error)?.name ?? "");

const shapeOk = (vectors: unknown, count: number) =>
  Array.isArray(vectors) &&
  vectors.length === count &&
  vectors.every((v) => Array.isArray(v) && v.length === EMBEDDING_DIMENSIONS);

/**
 * Provider calls per project per minute. A reconcile run makes at most EMBED_PER_RUN / EMBED_BATCH
 * (4) calls, so background work stays far below it; the rest is room for questions.
 */
export const EMBED_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

export async function activeEmbeddingModelId(): Promise<string | null> {
  return (await platformSettings()).embeddingModelId ?? null;
}

/**
 * Turns texts into vectors with the platform's embedding model. It does not use the chat chain:
 * there is no fallback to another model (vectors of two models cannot be compared) and no
 * deterministic answer. Every real call is counted in usage, with no text.
 */
export async function embedTexts(input: {
  projectId: string | null;
  texts: readonly string[];
  signal?: AbortSignal;
  override?: EmbedderOverride;
}): Promise<EmbedResult> {
  if (input.texts.length === 0) throw new RangeError("embedTexts needs at least one text");
  // Before the override too, so tests exercise the same limit as real calls.
  if (
    input.projectId &&
    !(await allow(`embed:${input.projectId}`, EMBED_RATE_LIMIT.limit, EMBED_RATE_LIMIT.windowMs))
  )
    throw new AppError("RATE_LIMIT");
  if (input.override) {
    const vectors = await input.override.embed(input.texts);
    if (!shapeOk(vectors, input.texts.length))
      throw new EmbeddingsUnavailable("provider_unavailable");
    return { vectors, modelId: input.override.modelId };
  }
  const settings = await platformSettings();
  const modelId = settings.embeddingModelId;
  if (!modelId) throw new EmbeddingsUnavailable("no_model");
  const catalog = await loadCatalog();
  if (!catalog.some((m) => m.id === modelId && embedderAllowed(m, settings.policy)))
    throw new EmbeddingsUnavailable("no_model");
  const [row] = await db
    .select({ model: aiModels, provider: aiProviders })
    .from(aiModels)
    .innerJoin(aiProviders, eq(aiProviders.id, aiModels.providerId))
    .where(eq(aiModels.id, modelId));
  if (!row) throw new EmbeddingsUnavailable("no_model");
  if (!row.provider.credentialId && !usesNoKey(row.provider.adapter))
    throw new EmbeddingsUnavailable("provider_unavailable");

  const started = performance.now();
  let client: AiProvider | null = null;
  try {
    const vectors = await withProviderSecret(row.provider, async (secret) => {
      const made = ADAPTERS[row.provider.adapter].createClient(
        { baseUrl: row.provider.baseUrl, configuration: row.provider.configuration },
        secret,
        row.model.modelId,
      );
      client = made;
      if (!made.embed) throw new AiUnsupportedError("embeddings");
      return made.embed(input.texts, { dimensions: EMBEDDING_DIMENSIONS, signal: input.signal });
    });
    if (!shapeOk(vectors, input.texts.length))
      throw new EmbeddingsUnavailable("provider_unavailable");
    await recordUsage({
      projectId: input.projectId,
      model: row.model,
      requestedId: modelId,
      fallbackUsed: false,
      operation: "embedding",
      client,
      started,
      status: "succeeded",
    });
    return { vectors, modelId };
  } catch (error) {
    if (error instanceof AiUnsupportedError) throw new EmbeddingsUnavailable("unsupported");
    const code =
      error instanceof AiProviderError ? error.code : isAbort(error) ? "aborted" : "failed";
    await recordUsage({
      projectId: input.projectId,
      model: row.model,
      requestedId: modelId,
      fallbackUsed: false,
      operation: "embedding",
      client,
      started,
      status: "failed",
      errorCode: code,
    });
    if (isAbort(error) || error instanceof AiProviderError) throw error;
    throw new EmbeddingsUnavailable("provider_unavailable");
  }
}
