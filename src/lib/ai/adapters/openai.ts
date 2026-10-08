import * as z from "zod";
import type { ProviderAdapterId } from "@/lib/domain/enums";
import { DATA_BOUNDARY_RULES, renderUserTurn } from "../prompt";
import type { AiProvider, AiRequest, AiUsage } from "../provider";
import { AiProviderError, request, sseData, trimSlash } from "./http";
import type { AdapterConfig, ProviderAdapter } from "./types";

type OpenAiId = Extract<ProviderAdapterId, "openai" | "openai_compatible" | "vercel_gateway">;

/** Chat Completions protocol: OpenAI, any OpenAI-compatible server and the Vercel AI Gateway. */
class OpenAiClient implements AiProvider {
  readonly deterministic = false;
  readonly config;
  usage?: AiUsage;

  constructor(
    private readonly base: string,
    private readonly apiKey: string,
    model: string,
    adapter: OpenAiId,
  ) {
    this.config = { provider: "openai" as const, model, adapter };
  }

  private messages(req: AiRequest) {
    return [
      { role: "system", content: `${req.system}\n\n${DATA_BOUNDARY_RULES}` },
      ...(req.history ?? []),
      { role: "user", content: renderUserTurn(req) },
    ];
  }

  private post(req: AiRequest, body: Record<string, unknown>) {
    return request(`${this.base}/chat/completions`, {
      method: "POST",
      adapter: this.config.adapter,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: req.maxOutputTokens ?? 1024,
        messages: this.messages(req),
        ...body,
      }),
      signal: req.signal,
    });
  }

  private track(u?: { prompt_tokens?: number; completion_tokens?: number }) {
    if (u) this.usage = { input: u.prompt_tokens ?? null, output: u.completion_tokens ?? null };
  }

  async generate(req: AiRequest): Promise<string> {
    const json = (await (await this.post(req, {})).json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    this.track(json.usage);
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new AiProviderError("bad_response");
    return text;
  }

  async *stream(req: AiRequest): AsyncIterable<string> {
    const response = await this.post(req, {
      stream: true,
      stream_options: { include_usage: true },
    });
    if (!response.body) throw new AiProviderError("bad_response");
    for await (const data of sseData(response.body)) {
      if (data === "[DONE]") return;
      const chunk = JSON.parse(data) as {
        choices?: { delta?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      this.track(chunk.usage);
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }

  async generateObject<T>(req: AiRequest, schema: z.ZodType<T>, name: string): Promise<T> {
    const json = (await (
      await this.post(req, {
        tools: [
          {
            type: "function",
            function: {
              name,
              description: "Return the structured result.",
              parameters: z.toJSONSchema(schema, { target: "draft-7" }),
            },
          },
        ],
        tool_choice: { type: "function", function: { name } },
      })
    ).json()) as {
      choices?: {
        message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] };
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    this.track(json.usage);
    const call = json.choices?.[0]?.message?.tool_calls?.find((c) => c.function?.name === name);
    let args: unknown;
    try {
      args = JSON.parse(call?.function?.arguments ?? "");
    } catch {
      throw new AiProviderError("bad_response");
    }
    const parsed = schema.safeParse(args);
    if (!parsed.success) throw new AiProviderError("bad_response");
    return parsed.data;
  }
}

const DEFAULTS: Record<OpenAiId, string | null> = {
  openai: "https://api.openai.com/v1",
  openai_compatible: null,
  vercel_gateway: "https://ai-gateway.vercel.sh/v1",
};

function make(id: OpenAiId): ProviderAdapter {
  const base = (c: AdapterConfig) => trimSlash(c.baseUrl || DEFAULTS[id] || "");
  return {
    id,
    defaultBaseUrl: DEFAULTS[id],
    requiresBaseUrl: id === "openai_compatible",
    createClient: (config, secret, model) => new OpenAiClient(base(config), secret, model, id),
    async test(config, secret) {
      try {
        const response = await request(`${base(config)}/models`, {
          method: "GET",
          adapter: id,
          headers: { authorization: `Bearer ${secret}` },
        });
        const json = (await response.json().catch(() => ({}))) as { data?: { id: string }[] };
        return { ok: true, code: "ok", models: json.data?.map((m) => m.id).slice(0, 100) };
      } catch (error) {
        return { ok: false, code: error instanceof AiProviderError ? error.code : "network" };
      }
    },
  };
}

export const openAiAdapter = make("openai");
export const openAiCompatibleAdapter = make("openai_compatible");
export const vercelGatewayAdapter = make("vercel_gateway");
