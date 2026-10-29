import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createModel,
  createProvider,
  fetchProviderModels,
  importModels,
  setDefaults,
} from "@/lib/ai/control-plane";
import { explainNoModel } from "@/lib/ai/diagnostics";
import { AiCallFailed, runAi } from "@/lib/ai/gateway";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { aiModels, auditEvents, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { createUser, resetDatabase } from "../helpers/db";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

const KEY = "sk-test-key-abcdefghijklmnop";
let owner: Actor;
let member: Actor;
let providerId: string;

/** The provider's /models endpoint, with whatever ids a test wants it to report. */
const listing = (ids: string[], status = 200) =>
  vi.stubGlobal(
    "fetch",
    async () => new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), { status }),
  );

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
  member = await createUser("Member");
  ({ id: providerId } = await createProvider(owner, {
    name: "OpenAI",
    type: "managed",
    adapter: "openai",
    secret: KEY,
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe("fetching a provider's models", () => {
  it("lists chat models with likely abilities, drops the rest, and flags those already added", async () => {
    await createModel(owner, {
      providerId,
      modelId: "gpt-4o",
      displayName: "GPT-4o",
      capabilities: ["text"],
    });
    listing(["gpt-4o", "gpt-4o-mini", "text-embedding-3-large", "whisper-1", "o3-mini"]);
    const result = await fetchProviderModels(owner, { providerId });
    expect(result.ok).toBe(true);
    expect(result.models.map((m) => m.modelId)).toEqual(["gpt-4o", "gpt-4o-mini", "o3-mini"]);
    expect(result.models.find((m) => m.modelId === "gpt-4o")?.added).toBe(true);
    const mini = result.models.find((m) => m.modelId === "gpt-4o-mini");
    expect(mini?.added).toBe(false);
    expect(mini?.capabilities).toEqual(
      expect.arrayContaining(["structured_output", "tool_calling"]),
    );
  });

  it("changes nothing by itself", async () => {
    listing(["gpt-4o"]);
    await fetchProviderModels(owner, { providerId });
    expect(await db.select().from(aiModels)).toEqual([]);
  });

  it("reports a refused key or a missing key without a list", async () => {
    listing([], 401);
    expect(await fetchProviderModels(owner, { providerId })).toMatchObject({
      ok: false,
      code: "auth_failed",
      models: [],
    });
    const { id } = await createProvider(owner, {
      name: "No key yet",
      type: "managed",
      adapter: "openai",
    });
    expect(await fetchProviderModels(owner, { providerId: id })).toMatchObject({
      ok: false,
      code: "no_credential",
    });
  });

  it("is for platform owners only", async () => {
    listing(["gpt-4o"]);
    expect(await code(fetchProviderModels(member, { providerId }))).toBe("AUTHORIZATION_ERROR");
    expect(await code(importModels(member, { providerId, models: [] }))).toBe(
      "AUTHORIZATION_ERROR",
    );
  });
});

describe("importing the chosen models", () => {
  const pick = (modelId: string) => ({
    modelId,
    displayName: modelId,
    capabilities: ["text", "structured_output"] as const,
  });

  it("adds only the chosen ones, once, and records it", async () => {
    const first = await importModels(owner, {
      providerId,
      models: [pick("gpt-4o"), pick("gpt-4o-mini"), pick("gpt-4o")],
    });
    expect(first).toEqual({ added: 2, skipped: 0 });
    const again = await importModels(owner, {
      providerId,
      models: [pick("gpt-4o"), pick("o3-mini")],
    });
    expect(again).toEqual({ added: 1, skipped: 1 });
    expect((await db.select().from(aiModels)).map((m) => m.modelId).sort()).toEqual([
      "gpt-4o",
      "gpt-4o-mini",
      "o3-mini",
    ]);
    const log = await db.select().from(auditEvents).where(eq(auditEvents.type, "model.imported"));
    expect(log).toHaveLength(2);
  });

  it("refuses an unknown provider, an empty pick and unknown abilities", async () => {
    expect(
      await code(importModels(owner, { providerId: crypto.randomUUID(), models: [pick("x")] })),
    ).toBe("NOT_FOUND");
    expect(await code(importModels(owner, { providerId, models: [] }))).toBe("VALIDATION_ERROR");
    expect(
      await code(
        importModels(owner, {
          providerId,
          models: [{ modelId: "x", displayName: "x", capabilities: ["telepathy"] }],
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });
});

describe("why no model answered", () => {
  const setUpModel = async (capabilities: string[]) => {
    const { id } = await createModel(owner, {
      providerId,
      modelId: "gpt-4o",
      displayName: "GPT-4o",
      capabilities,
    });
    await setDefaults(owner, { defaultModelId: id, fallbackModelId: null });
  };
  const ask = () =>
    runAi({
      operation: "structured_analysis",
      required: ["structured_output"],
      // The rules path: a deterministic server model answers with nothing.
      run: async (client) => (client.deterministic ? null : "answer"),
    });

  it("names the model that lacks structured output, instead of 'no model is set up'", async () => {
    await setUpModel(["text"]);
    const outcome = await ask();
    expect(outcome.deterministic).toBe(true);
    expect(explainNoModel(outcome.diagnostics)).toEqual({
      reason: "capability_missing",
      model: "OpenAI / GPT-4o",
      missing: ["structured_output"],
    });
  });

  it("names a model that was called and failed, with a safe code", async () => {
    await setUpModel(["text", "structured_output"]);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
    const outcome = await runAi({
      operation: "structured_analysis",
      required: ["structured_output"],
      run: async (client) => {
        if (client.deterministic) return null;
        // Any real call to the stubbed provider is refused.
        return client.generateObject(
          { system: "s", segments: [], userMessage: "u", draft: "{}" },
          (await import("zod")).object({}),
          "t",
        );
      },
    });
    expect(explainNoModel(outcome.diagnostics)).toMatchObject({
      reason: "provider_failed",
      model: "OpenAI / GPT-4o",
      code: "auth_failed",
    });
  });

  it("says nothing is chosen when no default model exists", async () => {
    const outcome = await ask();
    expect(explainNoModel(outcome.diagnostics)).toEqual({ reason: "no_model" });
  });

  it("is exported so callers can tell a failed server model apart", () => {
    expect(new AiCallFailed({ configured: false, rejected: [], failed: [] })).toBeInstanceOf(Error);
  });
});
