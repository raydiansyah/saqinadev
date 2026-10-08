/**
 * AI provider boundary, declared now so later phases plug in without touching the UI.
 * Phase 2 makes no AI calls: the analyzer and recommendation engine are deterministic.
 * Provider keys will only ever be read here, on the server, from environment variables.
 */

export const AI_PROVIDERS = [
  "openai",
  "anthropic",
  "google-gemini",
  "openai-compatible",
  "anthropic-compatible",
  "vercel-ai-gateway",
] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export interface AiProviderConfig {
  provider: AiProviderId;
  model: string;
  /** For *-compatible providers. */
  baseUrl?: string;
}

export interface AiTextRequest {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
}

/** What an AI-backed InterviewAnalyzer or RecommendationEngine will call. */
export interface AiProvider {
  readonly config: AiProviderConfig;
  generateText(request: AiTextRequest): Promise<string>;
}
