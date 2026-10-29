import type {
  ConnectionStatus,
  ModelCapability,
  ModelSource,
  ModelStatus,
  ProviderAdapterId,
  ProviderType,
} from "@/lib/domain/enums";

/**
 * The single source of truth for "which model answers this request". Pure: callers load the
 * catalog, settings and mappings; this decides. Order:
 *   agent override → project override → platform default → platform fallback → system fallback
 */

export interface CatalogModel {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  capabilities: ModelCapability[];
  status: ModelStatus;
  providerName: string;
  providerType: ProviderType;
  providerAdapter: ProviderAdapterId;
  providerEnabled: boolean;
  providerStatus: ConnectionStatus;
  /** A person's own gateway; only that person may use it. */
  ownerUserId: string | null;
}

export interface Policy {
  allowedProviderIds: string[] | null;
  allowedModelIds: string[] | null;
  allowProjectOverride: boolean;
  allowAgentOverride: boolean;
  allowExternalProviders: boolean;
}

export const DEFAULT_POLICY: Policy = {
  allowedProviderIds: null,
  allowedModelIds: null,
  allowProjectOverride: true,
  allowAgentOverride: true,
  allowExternalProviders: true,
};

export interface Mapping {
  primaryModelId: string;
  fallbackModelId: string | null;
  requiredCapabilities: ModelCapability[];
}

export interface ResolveInput {
  catalog: CatalogModel[];
  platform: { defaultModelId: string | null; fallbackModelId: string | null; policy: Policy };
  project?: {
    preferredModelId: string | null;
    allowedModelIds: string[] | null;
    allowAgentOverrides: boolean;
  } | null;
  /** Project mapping for this agent first, then the platform mapping for its role. */
  agentMappings?: Mapping[];
  required?: ModelCapability[];
  /** The person's own model picked in the chat: tried first, and the only one tried. */
  userChoice?: { modelId: string } | null;
}

export type RejectReason = "unavailable" | "policy" | "project_policy" | "capability";

export interface Candidate {
  model: CatalogModel;
  source: ModelSource;
}

export interface Resolution {
  /** Ordered usable candidates; the first is selected, the rest are fallbacks. */
  chain: Candidate[];
  rejected: { modelId: string; source: ModelSource; reason: RejectReason }[];
  required: ModelCapability[];
}

const USABLE_PROVIDER: ConnectionStatus[] = ["connected", "untested"];

export function modelUsable(m: CatalogModel): boolean {
  return (
    m.status === "available" && m.providerEnabled && USABLE_PROVIDER.includes(m.providerStatus)
  );
}

export function policyAllows(m: CatalogModel, p: Policy): boolean {
  // A person's own gateway sends their data to a provider the platform did not set up: only the
  // external-providers switch decides; the owner's allow-lists name platform providers.
  if (m.ownerUserId) return p.allowExternalProviders;
  if (p.allowedProviderIds && !p.allowedProviderIds.includes(m.providerId)) return false;
  if (p.allowedModelIds && !p.allowedModelIds.includes(m.id)) return false;
  if (!p.allowExternalProviders && m.providerType === "custom") return false;
  return true;
}

export function missingCapabilities(
  m: CatalogModel,
  required: ModelCapability[],
): ModelCapability[] {
  return required.filter((c) => !m.capabilities.includes(c));
}

export function resolveModel(input: ResolveInput): Resolution {
  const { catalog, platform, project } = input;
  const policy = platform.policy;
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const mappings = input.agentMappings ?? [];
  const required = [
    ...new Set([...(input.required ?? []), ...mappings.flatMap((m) => m.requiredCapabilities)]),
  ];

  const wanted: { id: string | null; source: ModelSource }[] = [];
  // The person chose their own model: it alone answers, so nothing is sent to another provider.
  if (input.userChoice) wanted.push({ id: input.userChoice.modelId, source: "user_choice" });
  const agentAllowed = policy.allowAgentOverride && (project?.allowAgentOverrides ?? true);
  if (agentAllowed && !input.userChoice)
    for (const m of mappings)
      wanted.push(
        { id: m.primaryModelId, source: "agent_override" },
        { id: m.fallbackModelId, source: "agent_override" },
      );
  if (!input.userChoice) {
    if (policy.allowProjectOverride && project?.preferredModelId)
      wanted.push({ id: project.preferredModelId, source: "project_override" });
    wanted.push(
      { id: platform.defaultModelId, source: "platform_default" },
      { id: platform.fallbackModelId, source: "fallback" },
    );
  }

  const chain: Candidate[] = [];
  const rejected: Resolution["rejected"] = [];
  const seen = new Set<string>();
  for (const { id, source } of wanted) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const model = byId.get(id);
    const reject = (reason: RejectReason) => rejected.push({ modelId: id, source, reason });
    if (!model || !modelUsable(model)) reject("unavailable");
    else if (!policyAllows(model, policy)) reject("policy");
    else if (project?.allowedModelIds && !project.allowedModelIds.includes(model.id))
      reject("project_policy");
    else if (missingCapabilities(model, required).length) reject("capability");
    else chain.push({ model, source });
  }
  return { chain, rejected, required };
}

/** Validates an Owner's mapping before saving: every model must exist, be usable and capable. */
export function validateMapping(
  catalog: CatalogModel[],
  mapping: Mapping,
):
  | { ok: true }
  | {
      ok: false;
      field: "primary" | "fallback";
      reason: RejectReason;
      missing?: ModelCapability[];
    } {
  for (const [field, id] of [
    ["primary", mapping.primaryModelId],
    ["fallback", mapping.fallbackModelId],
  ] as const) {
    if (!id) continue;
    const model = catalog.find((m) => m.id === id);
    if (!model || !modelUsable(model)) return { ok: false, field, reason: "unavailable" };
    const missing = missingCapabilities(model, mapping.requiredCapabilities);
    if (missing.length) return { ok: false, field, reason: "capability", missing };
  }
  return { ok: true };
}
