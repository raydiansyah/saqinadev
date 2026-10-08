import "server-only";
import { anthropicAdapter } from "./adapters/anthropic";
import { MockAiProvider } from "./mock";
import type { AiProvider } from "./provider";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

/**
 * Picks the provider for a request. Claude is used only when `ANTHROPIC_API_KEY` is set;
 * otherwise everything runs on deterministic rules. Tests force the mock with `override`.
 */
export function getAiProvider(options: { model?: string | null; override?: AiProvider } = {}) {
  if (options.override) return options.override;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || process.env.NODE_ENV === "test") return new MockAiProvider() as AiProvider;
  return anthropicAdapter.createClient(
    { baseUrl: null, configuration: {} },
    key,
    options.model || process.env.AI_MODEL || DEFAULT_MODEL,
  );
}

export function isModelEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.NODE_ENV !== "test";
}
