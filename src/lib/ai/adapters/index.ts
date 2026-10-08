import type { ProviderAdapterId } from "@/lib/domain/enums";
import { anthropicAdapter, anthropicCompatibleAdapter } from "./anthropic";
import { geminiAdapter } from "./gemini";
import { openAiAdapter, openAiCompatibleAdapter, vercelGatewayAdapter } from "./openai";
import type { ProviderAdapter } from "./types";

/** Adapter registry. A new provider protocol is one entry here. */
export const ADAPTERS: Record<ProviderAdapterId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  anthropic_compatible: anthropicCompatibleAdapter,
  openai: openAiAdapter,
  openai_compatible: openAiCompatibleAdapter,
  gemini: geminiAdapter,
  vercel_gateway: vercelGatewayAdapter,
};

export type { AdapterConfig, ConnectionTestResult, ProviderAdapter } from "./types";
