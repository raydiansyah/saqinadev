import type * as z from "zod";
import { DATA_BOUNDARY_RULES, renderUserTurn } from "../prompt";
import type { AiProvider, AiRequest, AiUsage } from "../provider";
import { AiProviderError, request, sseData, trimSlash } from "./http";
import type { AdapterConfig, ProviderAdapter } from "./types";

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

/** Google Gemini generateContent API. The key goes in a header, never in the URL. */
class GeminiClient implements AiProvider {
  readonly deterministic = false;
  readonly config;
  usage?: AiUsage;

  constructor(
    private readonly base: string,
    private readonly apiKey: string,
    model: string,
  ) {
    this.config = { provider: "google-gemini" as const, model, adapter: "gemini" };
  }

  private body(req: AiRequest, extra: Record<string, unknown> = {}) {
    const contents = [
      ...(req.history ?? []).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      { role: "user", parts: [{ text: renderUserTurn(req) }] },
    ];
    return JSON.stringify({
      systemInstruction: { parts: [{ text: `${req.system}\n\n${DATA_BOUNDARY_RULES}` }] },
      contents,
      generationConfig: { maxOutputTokens: req.maxOutputTokens ?? 1024, ...extra },
    });
  }

  private post(req: AiRequest, method: string, body: string, query = "") {
    return request(
      `${this.base}/v1beta/models/${encodeURIComponent(this.config.model)}:${method}${query}`,
      {
        method: "POST",
        adapter: "gemini",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body,
        signal: req.signal,
      },
    );
  }

  private text(json: GeminiResponse): string {
    this.usage = {
      input: json.usageMetadata?.promptTokenCount ?? null,
      output: json.usageMetadata?.candidatesTokenCount ?? null,
    };
    return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  }

  async generate(req: AiRequest): Promise<string> {
    return this.text(
      (await (await this.post(req, "generateContent", this.body(req))).json()) as GeminiResponse,
    );
  }

  async *stream(req: AiRequest): AsyncIterable<string> {
    const response = await this.post(req, "streamGenerateContent", this.body(req), "?alt=sse");
    if (!response.body) throw new AiProviderError("bad_response");
    for await (const data of sseData(response.body)) {
      const text = this.text(JSON.parse(data) as GeminiResponse);
      if (text) yield text;
    }
  }

  /** JSON mode, then strict validation; Gemini's schema dialect differs, zod is the judge. */
  async generateObject<T>(req: AiRequest, schema: z.ZodType<T>): Promise<T> {
    const raw = this.text(
      (await (
        await this.post(
          req,
          "generateContent",
          this.body(
            { ...req, system: `${req.system}\nRespond with a single JSON object only.` },
            {
              responseMimeType: "application/json",
            },
          ),
        )
      ).json()) as GeminiResponse,
    );
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new AiProviderError("bad_response");
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new AiProviderError("bad_response");
    return parsed.data;
  }
}

const DEFAULT_BASE = "https://generativelanguage.googleapis.com";
const base = (c: AdapterConfig) => trimSlash(c.baseUrl || DEFAULT_BASE);

export const geminiAdapter: ProviderAdapter = {
  id: "gemini",
  defaultBaseUrl: DEFAULT_BASE,
  requiresBaseUrl: false,
  createClient: (config, secret, model) => new GeminiClient(base(config), secret, model),
  async test(config, secret) {
    try {
      const response = await request(`${base(config)}/v1beta/models`, {
        method: "GET",
        adapter: "gemini",
        headers: { "x-goog-api-key": secret },
      });
      const json = (await response.json().catch(() => ({}))) as { models?: { name: string }[] };
      return {
        ok: true,
        code: "ok",
        models: json.models?.map((m) => m.name.replace(/^models\//, "")).slice(0, 100),
      };
    } catch (error) {
      return { ok: false, code: error instanceof AiProviderError ? error.code : "network" };
    }
  },
};
