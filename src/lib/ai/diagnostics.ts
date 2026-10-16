import type { ModelCapability } from "@/lib/domain/enums";
import type { RejectReason } from "./model-resolver";

/** Why the models the owner set up did not answer. Collected by the gateway for every call. */
export interface AiDiagnostics {
  /** The platform has a default or fallback model chosen at all. */
  configured: boolean;
  /** Models the resolver refused, with the reason. */
  rejected: { label: string; reason: RejectReason; missing: ModelCapability[] }[];
  /** Models that were tried and failed, with a safe error code. */
  failed: { label: string; code: string }[];
}

export const NO_DIAGNOSTICS: AiDiagnostics = { configured: false, rejected: [], failed: [] };

export type NoModelReason =
  /** Nothing is chosen as the default or fallback model. */
  | "no_model"
  /** A model is chosen but lacks a capability this feature needs. */
  | "capability_missing"
  /** A model is chosen but cannot be used: disabled, or its provider is off or failed its test. */
  | "model_unavailable"
  /** A model was called and failed (bad key, wrong model id, outage). */
  | "provider_failed";

export interface NoModelExplanation {
  reason: NoModelReason;
  /** The model concerned, for the message. */
  model?: string;
  missing?: ModelCapability[];
  code?: string;
}

/**
 * When no model answered, say which of the four situations it was. Order matters: a model that
 * was actually called and failed is the most specific thing to report.
 */
export function explainNoModel(d: AiDiagnostics): NoModelExplanation {
  const failed = d.failed[0];
  if (failed) return { reason: "provider_failed", model: failed.label, code: failed.code };
  const capability = d.rejected.find((r) => r.reason === "capability");
  if (capability)
    return { reason: "capability_missing", model: capability.label, missing: capability.missing };
  const unusable = d.rejected[0];
  if (unusable) return { reason: "model_unavailable", model: unusable.label };
  return { reason: "no_model" };
}
