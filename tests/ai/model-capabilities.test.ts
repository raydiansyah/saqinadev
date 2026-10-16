import { describe, expect, it } from "vitest";
import { explainNoModel } from "@/lib/ai/diagnostics";
import { inferCapabilities, isChatModel } from "@/lib/ai/model-capabilities";

describe("isChatModel", () => {
  it("keeps chat models and drops embeddings, speech, images and moderation", () => {
    for (const id of ["gpt-4o", "claude-sonnet-5-5", "gemini-2.5-pro", "o3-mini", "llama-3.1-70b"])
      expect(isChatModel(id), id).toBe(true);
    for (const id of [
      "text-embedding-3-large",
      "whisper-1",
      "tts-1",
      "dall-e-3",
      "omni-moderation-latest",
      "gpt-4o-realtime-preview",
      "gpt-4o-audio-preview",
    ])
      expect(isChatModel(id), id).toBe(false);
  });
});

describe("inferCapabilities", () => {
  it("gives well-known families structured output and tools", () => {
    for (const [adapter, id] of [
      ["anthropic", "claude-sonnet-5-5"],
      ["openai", "gpt-4o"],
      ["gemini", "gemini-2.5-flash"],
      ["openai", "o3-mini"],
    ] as const) {
      const caps = inferCapabilities(adapter, id);
      expect(caps, id).toEqual(
        expect.arrayContaining(["text", "streaming", "structured_output", "tool_calling"]),
      );
    }
  });

  it("recognises the family behind a gateway prefix", () => {
    expect(inferCapabilities("vercel_gateway", "anthropic/claude-opus-5-5")).toContain(
      "structured_output",
    );
  });

  it("never promises structured output for an unknown model on a compatible endpoint", () => {
    const caps = inferCapabilities("openai_compatible", "llama-3.1-70b-instruct");
    expect(caps).toEqual(["text", "streaming"]);
  });

  it("marks reasoning and long context where the family has them", () => {
    expect(inferCapabilities("openai", "o3-mini")).toContain("reasoning");
    expect(inferCapabilities("anthropic", "claude-sonnet-5-5")).toContain("long_context");
    expect(inferCapabilities("openai", "gpt-3.5-turbo")).not.toContain("reasoning");
  });
});

describe("explainNoModel", () => {
  const base = { configured: true, rejected: [], failed: [] };

  it("says no model is chosen when nothing is configured", () => {
    expect(explainNoModel({ ...base, configured: false })).toEqual({ reason: "no_model" });
  });

  it("names the model that lacks a capability", () => {
    expect(
      explainNoModel({
        ...base,
        rejected: [
          { label: "OpenAI / gpt-4o", reason: "capability", missing: ["structured_output"] },
        ],
      }),
    ).toEqual({
      reason: "capability_missing",
      model: "OpenAI / gpt-4o",
      missing: ["structured_output"],
    });
  });

  it("reports an unusable model, and a failed call before anything else", () => {
    const unusable = { label: "X / m", reason: "unavailable" as const, missing: [] };
    expect(explainNoModel({ ...base, rejected: [unusable] })).toMatchObject({
      reason: "model_unavailable",
      model: "X / m",
    });
    expect(
      explainNoModel({
        ...base,
        rejected: [unusable],
        failed: [{ label: "Y / n", code: "auth_failed" }],
      }),
    ).toEqual({ reason: "provider_failed", model: "Y / n", code: "auth_failed" });
  });
});
