import * as z from "zod";
import { DATA_BOUNDARY_RULES, renderUserTurn } from "../prompt";
import type { AiProvider, AiRequest, AiUsage } from "../provider";
import { AiProviderError, request, sseData, trimSlash } from "./http";
import type { AdapterConfig, ProviderAdapter } from "./types";

const API_VERSION = "2023-06-01";

class AnthropicClient implements AiProvider {
  readonly deterministic = false;
  readonly config;
  usage?: AiUsage;

  constructor(
    private readonly base: string,
    private readonly apiKey: string,
    model: string,
    adapter: "anthropic" | "anthropic_compatible",
  ) {
    this.config = { provider: "anthropic" as const, model, adapter };
  }

  private body(req: AiRequest, extra: Record<string, unknown> = {}) {
    return JSON.stringify({
      model: this.config.model,
      max_tokens: req.maxOutputTokens ?? 1024,
      system: `${req.system}\n\n${DATA_BOUNDARY_RULES}`,
      messages: [...(req.history ?? []), { role: "user", content: renderUserTurn(req) }],
      ...extra,
    });
  }

  private post(req: AiRequest, body: string) {
    return request(`${this.base}/v1/messages`, {
      method: "POST",
      adapter: this.config.adapter,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": API_VERSION,
      },
      body,
      signal: req.signal,
    });
  }

  private track(u?: { input_tokens?: number; output_tokens?: number }) {
    this.usage = { input: u?.input_tokens ?? null, output: u?.output_tokens ?? null };
  }

  async generate(req: AiRequest): Promise<string> {
    const json = (await (await this.post(req, this.body(req))).json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    this.track(json.usage);
    return (json.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  }

  async *stream(req: AiRequest): AsyncIterable<string> {
    const response = await this.post(req, this.body(req, { stream: true }));
    if (!response.body) throw new AiProviderError("bad_response");
    for await (const data of sseData(response.body)) {
      const event = JSON.parse(data) as {
        type: string;
        delta?: { type: string; text?: string };
        usage?: { input_tokens?: number; output_tokens?: number };
        message?: { usage?: { input_tokens?: number } };
      };
      if (event.type === "message_start") this.track(event.message?.usage);
      if (event.type === "message_delta" && event.usage)
        this.usage = {
          input: this.usage?.input ?? null,
          output: event.usage.output_tokens ?? null,
        };
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta")
        yield event.delta.text ?? "";
      if (event.type === "error") throw new AiProviderError("provider_error");
    }
  }

  async generateObject<T>(req: AiRequest, schema: z.ZodType<T>, name: string): Promise<T> {
    const body = this.body(req, {
      tools: [
        {
          name,
          description: "Return the structured result.",
          input_schema: z.toJSONSchema(schema, { target: "draft-7" }),
        },
      ],
      tool_choice: { type: "tool", name },
    });
    const json = (await (await this.post(req, body)).json()) as {
      content?: { type: string; name?: string; input?: unknown }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    this.track(json.usage);
    const call = json.content?.find((b) => b.type === "tool_use" && b.name === name);
    const parsed = schema.safeParse(call?.input);
    if (!parsed.success) throw new AiProviderError("bad_response");
    return parsed.data;
  }
}

function make(id: "anthropic" | "anthropic_compatible"): ProviderAdapter {
  const defaultBaseUrl = id === "anthropic" ? "https://api.anthropic.com" : null;
  const base = (c: AdapterConfig) => trimSlash(c.baseUrl || defaultBaseUrl || "");
  return {
    id,
    defaultBaseUrl,
    requiresBaseUrl: id === "anthropic_compatible",
    createClient: (config, secret, model) => new AnthropicClient(base(config), secret, model, id),
    async test(config, secret) {
      try {
        const response = await request(`${base(config)}/v1/models`, {
          method: "GET",
          adapter: id,
          headers: { "x-api-key": secret, "anthropic-version": API_VERSION },
        });
        const json = (await response.json().catch(() => ({}))) as { data?: { id: string }[] };
        return { ok: true, code: "ok", models: json.data?.map((m) => m.id).slice(0, 100) };
      } catch (error) {
        return { ok: false, code: error instanceof AiProviderError ? error.code : "network" };
      }
    },
  };
}

export const anthropicAdapter = make("anthropic");
export const anthropicCompatibleAdapter = make("anthropic_compatible");
