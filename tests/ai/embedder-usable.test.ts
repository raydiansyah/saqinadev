import { describe, expect, it } from "vitest";
import { type CatalogModel, embedderUsable, modelUsable } from "@/lib/ai/model-resolver";

const model = (over: Partial<CatalogModel>): CatalogModel => ({
  id: "m1",
  providerId: "p1",
  modelId: "x",
  displayName: "X",
  capabilities: ["text"],
  status: "available",
  providerName: "P",
  providerType: "custom",
  providerAdapter: "openai_compatible",
  providerEnabled: true,
  providerStatus: "connected",
  ownerUserId: null,
  ...over,
});

describe("embedding-only models", () => {
  it("never enter a chat chain or become a default", () => {
    expect(modelUsable(model({ capabilities: ["embeddings"] }))).toBe(false);
    expect(modelUsable(model({ capabilities: ["text", "embeddings"] }))).toBe(true);
  });

  it("are usable as embedders only when available, enabled and connected", () => {
    expect(embedderUsable(model({ capabilities: ["embeddings"] }))).toBe(true);
    expect(embedderUsable(model({ capabilities: ["text"] }))).toBe(false);
    expect(embedderUsable(model({ capabilities: ["embeddings"], status: "disabled" }))).toBe(false);
    expect(embedderUsable(model({ capabilities: ["embeddings"], providerEnabled: false }))).toBe(
      false,
    );
    expect(embedderUsable(model({ capabilities: ["embeddings"], providerStatus: "error" }))).toBe(
      false,
    );
  });
});
