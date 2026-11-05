import { afterEach, describe, expect, it, vi } from "vitest";
import { ADAPTERS } from "@/lib/ai/adapters";
import { AiProviderError } from "@/lib/ai/adapters/http";

const vec = (n: number, v: number) => Array.from({ length: n }, () => v);

interface Call {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function stubFetch(reply: (call: Call) => unknown): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const call: Call = {
        url: String(url),
        body: JSON.parse(String(init.body)),
        headers: init.headers as Record<string, string>,
      };
      calls.push(call);
      return new Response(JSON.stringify(reply(call)), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const config = { baseUrl: null, configuration: {} };

describe("OpenAI-compatible embeddings", () => {
  it("asks for the fixed size and returns vectors in input order", async () => {
    const calls = stubFetch(() => ({
      data: [
        { index: 1, embedding: vec(4, 0.2) },
        { index: 0, embedding: vec(4, 0.1) },
      ],
      usage: { prompt_tokens: 12 },
    }));
    const client = ADAPTERS.openai.createClient(config, "sk-test", "text-embedding-3-small");
    const out = await client.embed?.(["a", "b"], { dimensions: 4 });
    expect(out).toEqual([vec(4, 0.1), vec(4, 0.2)]);
    expect(calls[0].url).toBe("https://api.openai.com/v1/embeddings");
    expect(calls[0].body).toMatchObject({
      model: "text-embedding-3-small",
      input: ["a", "b"],
      dimensions: 4,
    });
    expect(calls[0].headers.authorization).toBe("Bearer sk-test");
    expect(client.usage).toEqual({ input: 12, output: null });
  });

  it("rejects a wrong count or a wrong size instead of storing it", async () => {
    stubFetch(() => ({ data: [{ index: 0, embedding: vec(3, 0.1) }] }));
    const client = ADAPTERS.openai.createClient(config, "k", "m-embed");
    await expect(client.embed?.(["a", "b"], { dimensions: 3 })).rejects.toMatchObject({
      code: "bad_response",
    });
    await expect(client.embed?.(["a"], { dimensions: 4 })).rejects.toBeInstanceOf(AiProviderError);
  });
});

describe("Gemini embeddings", () => {
  it("uses batchEmbedContents with the key in a header and the fixed size", async () => {
    const calls = stubFetch(() => ({
      embeddings: [{ values: vec(4, 0.3) }, { values: vec(4, 0.4) }],
    }));
    const client = ADAPTERS.gemini.createClient(config, "g-key", "gemini-embedding-001");
    const out = await client.embed?.(["a", "b"], { dimensions: 4 });
    expect(out).toEqual([vec(4, 0.3), vec(4, 0.4)]);
    expect(calls[0].url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents",
    );
    expect(calls[0].headers["x-goog-api-key"]).toBe("g-key");
    expect(calls[0].body).toMatchObject({
      requests: [
        {
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: "a" }] },
          outputDimensionality: 4,
        },
        {
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: "b" }] },
          outputDimensionality: 4,
        },
      ],
    });
  });
});

describe("providers without embeddings", () => {
  it("leave embed out, so the gateway reports them as unsupported", () => {
    expect(ADAPTERS.anthropic.createClient(config, "k", "claude-sonnet-5-5").embed).toBeUndefined();
  });
});
