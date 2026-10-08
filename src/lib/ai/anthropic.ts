import "server-only";
import * as z from "zod";
import { log } from "@/lib/log";
import { DATA_BOUNDARY_RULES, renderUserTurn } from "./prompt";
import type { AiProvider, AiRequest } from "./provider";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const TIMEOUT_MS = 45_000;

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

/**
 * Claude through the Messages API, called with plain fetch so there is no SDK to keep in
 * sync. The key never leaves this module and is never logged.
 */
export class AnthropicProvider implements AiProvider {
  readonly deterministic = false;
  readonly config;

  constructor(
    private readonly apiKey: string,
    model: string,
  ) {
    this.config = { provider: "anthropic" as const, model };
  }

  private body(request: AiRequest, extra: Record<string, unknown> = {}) {
    return {
      model: this.config.model,
      max_tokens: request.maxOutputTokens ?? 1024,
      system: `${request.system}\n\n${DATA_BOUNDARY_RULES}`,
      messages: [...(request.history ?? []), { role: "user", content: renderUserTurn(request) }],
      ...extra,
    };
  }

  private async post(request: AiRequest, body: unknown): Promise<Response> {
    const signals = [AbortSignal.timeout(TIMEOUT_MS)];
    if (request.signal) signals.push(request.signal);
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any(signals),
    });
    if (!response.ok) {
      log.warn("ai.anthropic_error", { status: response.status, model: this.config.model });
      throw new AiProviderError("Model request failed", response.status);
    }
    return response;
  }

  async generate(request: AiRequest): Promise<string> {
    const response = await this.post(request, this.body(request));
    const json = (await response.json()) as { content?: { type: string; text?: string }[] };
    return (json.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  }

  async *stream(request: AiRequest): AsyncIterable<string> {
    const response = await this.post(request, this.body(request, { stream: true }));
    if (!response.body) throw new AiProviderError("Empty stream");
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      // Server-sent events are separated by a blank line; keep the trailing partial event.
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const data = event
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice(6);
        if (!data) continue;
        const parsed = JSON.parse(data) as {
          type: string;
          delta?: { type: string; text?: string };
        };
        if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
          yield parsed.delta.text ?? "";
        }
        if (parsed.type === "error") throw new AiProviderError("Stream error");
      }
    }
  }

  /** Forces a single tool call whose input must match `schema`; invalid output is an error. */
  async generateObject<T>(request: AiRequest, schema: z.ZodType<T>, name: string): Promise<T> {
    const response = await this.post(
      request,
      this.body(request, {
        tools: [
          {
            name,
            description: "Return the structured result.",
            input_schema: z.toJSONSchema(schema, { target: "draft-7" }),
          },
        ],
        tool_choice: { type: "tool", name },
      }),
    );
    const json = (await response.json()) as {
      content?: { type: string; name?: string; input?: unknown }[];
    };
    const call = json.content?.find((b) => b.type === "tool_use" && b.name === name);
    const result = schema.safeParse(call?.input);
    if (!result.success) throw new AiProviderError("Model returned invalid structured output");
    return result.data;
  }
}
