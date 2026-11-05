import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AiProviderError } from "@/lib/ai/adapters/http";
import { setEmbeddingModel, setPolicy } from "@/lib/ai/control-plane";
import {
  activeEmbeddingModelId,
  EMBED_RATE_LIMIT,
  EmbeddingsUnavailable,
  embedTexts,
} from "@/lib/ai/embeddings";
import { DEFAULT_POLICY } from "@/lib/ai/model-resolver";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { aiModels, aiProviders, aiUsageRecords, rateLimits, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { createUser, resetDatabase } from "../helpers/db";
import { installEmbeddingModel, removeEmbeddingModel } from "../helpers/embedding-model";
import { fakeEmbedder } from "../helpers/fake-embedder";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError
      ? `${e.code}:${Object.values(e.fields ?? {})[0] ?? ""}`
      : String(e);
  }
};

let owner: Actor;
let member: Actor;

beforeEach(async () => {
  await resetDatabase();
  await db.delete(aiUsageRecords);
  owner = await createUser("Owner");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
  member = await createUser("Member");
});
afterEach(removeEmbeddingModel);

describe("embedTexts", () => {
  it("says nothing can embed when no model is chosen", async () => {
    expect(await activeEmbeddingModelId()).toBeNull();
    await expect(embedTexts({ projectId: null, texts: ["a"] })).rejects.toMatchObject({
      reason: "no_model",
    });
    await expect(embedTexts({ projectId: null, texts: ["a"] })).rejects.toBeInstanceOf(
      EmbeddingsUnavailable,
    );
  });

  it("refuses a project over its per-minute embedding limit, and counts each project apart", async () => {
    const modelId = await installEmbeddingModel();
    const projectId = randomUUID();
    await db
      .insert(rateLimits)
      .values({ key: `embed:${projectId}`, count: EMBED_RATE_LIMIT.limit, windowStart: new Date() })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { count: EMBED_RATE_LIMIT.limit, windowStart: new Date() },
      });
    const call = (id: string) =>
      embedTexts({ projectId: id, texts: ["a"], override: fakeEmbedder(modelId) });
    expect(await code(call(projectId))).toBe("RATE_LIMIT:");
    expect(await code(call(randomUUID()))).toBe("OK");
  });

  it("returns the vectors and the model that made them (injected embedder)", async () => {
    const modelId = await installEmbeddingModel();
    const out = await embedTexts({
      projectId: null,
      texts: ["one", "two"],
      override: fakeEmbedder(modelId),
    });
    expect(out.modelId).toBe(modelId);
    expect(out.vectors).toHaveLength(2);
    expect(out.vectors[0]).toHaveLength(1536);
  });

  it("is unavailable, and records no usage, when the provider has no credential", async () => {
    await installEmbeddingModel();
    await expect(embedTexts({ projectId: null, texts: ["secret words"] })).rejects.toMatchObject({
      reason: "provider_unavailable",
    });
    expect(await db.select().from(aiUsageRecords)).toHaveLength(0);
  });

  it("records failed usage with the embedding operation and no text when the provider call fails", async () => {
    await installEmbeddingModel({ credentialBy: owner.id });
    // The registered provider points at a closed port: the call fails with a safe code.
    const error = await embedTexts({ projectId: null, texts: ["secret words"] }).catch((e) => e);
    expect(error instanceof AiProviderError || error instanceof EmbeddingsUnavailable).toBe(true);
    const usage = await db.select().from(aiUsageRecords);
    expect(usage.at(-1)).toMatchObject({
      operation: "embedding",
      status: "failed",
      errorCode: error instanceof AiProviderError ? error.code : "failed",
    });
    expect(JSON.stringify(usage)).not.toContain("secret words");
  });
});

describe("embedTexts guards", () => {
  const tight = {
    allowedProviderIds: null,
    allowedModelIds: null,
    allowProjectOverride: false,
    allowAgentOverride: false,
    allowExternalProviders: false,
  };
  const restore = () =>
    setPolicy(owner, {
      allowedProviderIds: null,
      allowedModelIds: null,
      allowProjectOverride: DEFAULT_POLICY.allowProjectOverride,
      allowAgentOverride: DEFAULT_POLICY.allowAgentOverride,
      allowExternalProviders: DEFAULT_POLICY.allowExternalProviders,
    });

  it("refuses a model the Owner policy disallows, at choice and at call", async () => {
    try {
      await setPolicy(owner, tight);
      const modelId = await installEmbeddingModel({ credentialBy: owner.id });
      expect(await code(setEmbeddingModel(owner, { modelId }))).toBe(
        "VALIDATION_ERROR:unavailable",
      );
      await restore();
      expect(await code(setEmbeddingModel(owner, { modelId }))).toBe("OK");
      await setPolicy(owner, tight);
      await expect(embedTexts({ projectId: null, texts: ["a"] })).rejects.toMatchObject({
        reason: "no_model",
      });
      expect(await db.select().from(aiUsageRecords)).toHaveLength(0);
    } finally {
      await restore();
    }
  });

  it("refuses a provider whose connection status is error", async () => {
    const modelId = await installEmbeddingModel({ credentialBy: owner.id });
    const [m] = await db.select().from(aiModels).where(eq(aiModels.id, modelId));
    await db.update(aiProviders).set({ status: "error" }).where(eq(aiProviders.id, m.providerId));
    await expect(embedTexts({ projectId: null, texts: ["a"] })).rejects.toMatchObject({
      reason: "no_model",
    });
  });

  it("rejects an empty list and a wrongly sized vector", async () => {
    const modelId = await installEmbeddingModel();
    await expect(
      embedTexts({ projectId: null, texts: [], override: fakeEmbedder(modelId) }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      embedTexts({
        projectId: null,
        texts: ["a"],
        override: { modelId, embed: async () => [[1, 2, 3]] },
      }),
    ).rejects.toBeInstanceOf(EmbeddingsUnavailable);
  });
});

describe("setEmbeddingModel", () => {
  it("lets only the platform Owner choose, and only a model that embeds", async () => {
    const modelId = await installEmbeddingModel();
    await db
      .update(aiModels)
      .set({ capabilities: ["text"] })
      .where(eq(aiModels.id, modelId));
    expect(await code(setEmbeddingModel(member, { modelId }))).toBe("AUTHORIZATION_ERROR:");
    expect(await code(setEmbeddingModel(owner, { modelId }))).toBe("VALIDATION_ERROR:unavailable");
    await db
      .update(aiModels)
      .set({ capabilities: ["embeddings"] })
      .where(eq(aiModels.id, modelId));
    expect(await code(setEmbeddingModel(owner, { modelId }))).toBe("OK");
    expect(await activeEmbeddingModelId()).toBe(modelId);
    await setEmbeddingModel(owner, { modelId: null });
    expect(await activeEmbeddingModelId()).toBeNull();
  });
});
