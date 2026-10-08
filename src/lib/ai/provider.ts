import type * as z from "zod";

/**
 * Provider-independent AI boundary. Components and domain services only talk to `AIProvider`;
 * which implementation answers (deterministic mock, Anthropic, later others) is decided on the
 * server in `ai/registry.ts`. Keys are read only there, from environment variables.
 */

export const AI_PROVIDERS = [
  "openai",
  "anthropic",
  "google-gemini",
  "openai-compatible",
  "anthropic-compatible",
  "vercel-ai-gateway",
] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number] | "mock";

export interface AiProviderConfig {
  provider: AiProviderId;
  model: string;
  /** For *-compatible providers. */
  baseUrl?: string;
}

/**
 * Where a piece of prompt text came from. Only `instruction` carries authority; everything else
 * is data the model may read but must never obey (prompt-injection boundary).
 */
export type PromptSegmentKind = "instruction" | "project_data" | "external" | "tool_output";

export interface PromptSegment {
  kind: PromptSegmentKind;
  label: string;
  content: string;
}

export interface AiRequest {
  /** Application-owned instructions. Never contains user or project text. */
  system: string;
  segments: PromptSegment[];
  history?: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
  /**
   * Deterministic answer computed by the application from project data. Real providers use it
   * as grounding; the mock provider returns it as is.
   */
  draft: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface AiProvider {
  readonly config: AiProviderConfig;
  /** True when answers are produced by rules rather than a language model. */
  readonly deterministic: boolean;
  generate(request: AiRequest): Promise<string>;
  /** Yields text as it is produced. No artificial delays. */
  stream(request: AiRequest): AsyncIterable<string>;
  /** Structured output, always validated against `schema` before it is returned. */
  generateObject<T>(request: AiRequest, schema: z.ZodType<T>, name: string): Promise<T>;
}

export class AiUnsupportedError extends Error {
  constructor(what: string) {
    super(`${what} is not supported by this provider`);
    this.name = "AiUnsupportedError";
  }
}
