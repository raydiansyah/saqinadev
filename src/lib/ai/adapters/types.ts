import type { ProviderAdapterId } from "@/lib/domain/enums";
import type { AiProvider } from "../provider";
import type { ProviderErrorCode } from "./http";

export interface AdapterConfig {
  baseUrl: string | null;
  configuration: Record<string, string>;
}

export interface ConnectionTestResult {
  ok: boolean;
  code: "ok" | ProviderErrorCode;
  /** Model ids the credential can see, when the provider lists them. */
  models?: string[];
}

/**
 * One adapter per provider protocol. Adding a provider means adding an adapter here; the
 * orchestrator and UI only ever see `AiProvider`.
 */
export interface ProviderAdapter {
  id: ProviderAdapterId;
  defaultBaseUrl: string | null;
  /** Custom/compatible adapters need an explicit base URL. */
  requiresBaseUrl: boolean;
  createClient(config: AdapterConfig, secret: string, modelId: string): AiProvider;
  test(config: AdapterConfig, secret: string): Promise<ConnectionTestResult>;
}
