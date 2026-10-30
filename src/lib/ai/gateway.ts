import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { aiProviders, aiUsageRecords } from "@/lib/db/schema";
import type { AgentRole, AiOperation, ModelCapability } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { log } from "@/lib/log";
import { allow } from "@/lib/rate-limit";
import { withSecret } from "@/lib/secrets/service";
import { ADAPTERS } from "./adapters";
import { AiProviderError } from "./adapters/http";
import { resolutionInput } from "./catalog";
import { type AiDiagnostics, NO_DIAGNOSTICS } from "./diagnostics";
import { MockAiProvider } from "./mock";
import { type CatalogModel, missingCapabilities, resolveModel } from "./model-resolver";
import type { AiProvider } from "./provider";
import { getAiProvider } from "./registry";

export type ResolvedSource =
  | "user_choice"
  | "agent_override"
  | "project_override"
  | "platform_default"
  | "fallback"
  | "system"
  | "rules";

export interface AiOutcome<T> {
  value: T;
  /** First choice of the resolver, if any. */
  requested: { id: string; label: string } | null;
  /** What actually answered. `rules` means no model ran. */
  actual: { id: string | null; label: string };
  source: ResolvedSource;
  fallbackUsed: boolean;
  deterministic: boolean;
  /** Why configured models were skipped or failed; empty when one answered. */
  diagnostics: AiDiagnostics;
}

/** Thrown when nothing answered, including the server's own model. Carries the reasons. */
export class AiCallFailed extends Error {
  constructor(readonly diagnostics: AiDiagnostics) {
    super("ai_call_failed");
  }
}

export interface AiCall<T> {
  access?: ProjectAccess | null;
  agent?: { id: string; role: AgentRole; modelId?: string | null } | null;
  operation: AiOperation;
  required?: ModelCapability[];
  /** Does the work with whichever client the gateway hands over. Throwing tries the next model. */
  run: (client: AiProvider) => Promise<T>;
  /** Tests inject a provider instead of the catalog. */
  override?: AiProvider;
  /**
   * The person's own model (an id from their own gateway). It alone is tried: if it cannot answer,
   * the platform's models are not used, so what they wrote never goes to a provider they avoided.
   */
  userModelId?: string | null;
}

const label = (m: CatalogModel) => `${m.providerName} / ${m.displayName}`;

async function recordUsage(input: {
  projectId: string | null;
  model: CatalogModel | null;
  requestedId: string | null;
  fallbackUsed: boolean;
  operation: AiOperation;
  client: AiProvider | null;
  started: number;
  status: "succeeded" | "failed";
  errorCode?: string;
}) {
  await db
    .insert(aiUsageRecords)
    .values({
      projectId: input.projectId,
      providerId: input.model?.providerId ?? null,
      modelId: input.model?.id ?? null,
      requestedModelId: input.requestedId,
      fallbackUsed: input.fallbackUsed,
      operation: input.operation,
      inputTokens: input.client?.usage?.input ?? null,
      outputTokens: input.client?.usage?.output ?? null,
      durationMs: Math.round(performance.now() - input.started),
      status: input.status,
      errorCode: input.errorCode ?? null,
    })
    .catch((error) => log.warn("ai.usage_record_failed", { error: String(error) }));
}

/**
 * Every model call goes through here: rate limit → resolve → capability-checked chain →
 * call with recorded fallback → usage. When no configured model fits, the env model (if any)
 * answers, else deterministic rules; the outcome always says which.
 */
export async function runAi<T>(call: AiCall<T>): Promise<AiOutcome<T>> {
  const projectId = call.access?.project.id ?? null;
  if (projectId && !(await allow(`ai:${projectId}`, 120, 60_000))) throw new AppError("RATE_LIMIT");

  if (call.override) {
    const value = await call.run(call.override);
    return {
      value,
      requested: null,
      actual: {
        id: null,
        label: call.override.deterministic ? "rules" : call.override.config.model,
      },
      source: call.override.deterministic ? "rules" : "system",
      fallbackUsed: false,
      deterministic: call.override.deterministic,
      diagnostics: NO_DIAGNOSTICS,
    };
  }

  const userId = call.access?.actor.id ?? null;
  const own = call.userModelId && userId ? { id: userId, modelId: call.userModelId } : null;
  const input = await resolutionInput({ projectId, agent: call.agent ?? null, user: own });
  const resolution = resolveModel({ ...input, required: call.required ?? [] });
  const providers = resolution.chain.length
    ? await db
        .select()
        .from(aiProviders)
        .where(
          inArray(aiProviders.id, [...new Set(resolution.chain.map((c) => c.model.providerId))]),
        )
    : [];
  const requested = resolution.chain[0]?.model ?? null;
  const catalog = new Map(input.catalog.map((m) => [m.id, m]));
  const diagnostics: AiDiagnostics = {
    configured: Boolean(input.platform.defaultModelId || input.platform.fallbackModelId),
    rejected: resolution.rejected.flatMap((r) => {
      const model = catalog.get(r.modelId);
      return model
        ? [
            {
              label: label(model),
              reason: r.reason,
              missing: missingCapabilities(model, resolution.required),
            },
          ]
        : [];
    }),
    failed: [],
  };

  for (const [index, candidate] of resolution.chain.entries()) {
    const provider = providers.find((p) => p.id === candidate.model.providerId);
    if (!provider?.credentialId) continue;
    const started = performance.now();
    let client: AiProvider | null = null;
    try {
      const value = await withSecret(
        provider.credentialId,
        { kind: "ai_provider", userId: provider.ownerUserId },
        (secret) => {
          client = ADAPTERS[provider.adapter].createClient(
            { baseUrl: provider.baseUrl, configuration: provider.configuration },
            secret,
            candidate.model.modelId,
          );
          return call.run(client);
        },
      );
      const fallbackUsed = index > 0;
      await recordUsage({
        projectId,
        model: candidate.model,
        requestedId: requested?.id ?? null,
        fallbackUsed,
        operation: call.operation,
        client,
        started,
        status: "succeeded",
      });
      if (fallbackUsed && call.access)
        await recordFallback(call.access, requested, candidate.model);
      return {
        value,
        requested: requested ? { id: requested.id, label: label(requested) } : null,
        actual: { id: candidate.model.id, label: label(candidate.model) },
        source: candidate.source,
        fallbackUsed,
        deterministic: false,
        diagnostics: { ...diagnostics, failed: diagnostics.failed },
      };
    } catch (error) {
      const code =
        error instanceof AiProviderError ? error.code : isAbort(error) ? "aborted" : "failed";
      await recordUsage({
        projectId,
        model: candidate.model,
        requestedId: requested?.id ?? null,
        fallbackUsed: index > 0,
        operation: call.operation,
        client,
        started,
        status: "failed",
        errorCode: code,
      });
      if (code === "aborted") throw error;
      if (provider && code === "auth_failed")
        await db
          .update(aiProviders)
          .set({ status: "unauthorized" })
          .where(eq(aiProviders.id, provider.id));
      diagnostics.failed.push({ label: label(candidate.model), code });
      log.warn("ai.candidate_failed", { model: candidate.model.modelId, code });
    }
  }

  // Nothing configured worked: the env model if present, otherwise rules. Recorded either way.
  // A person's own choice never falls back to another provider: rules answer, with the reasons.
  const system = own ? new MockAiProvider() : getAiProvider();
  const started = performance.now();
  let value: T;
  try {
    value = await call.run(system);
  } catch (error) {
    if (isAbort(error)) throw error;
    // The server's own model failed too: report every reason instead of a bare error.
    diagnostics.failed.push({
      label: system.config.model,
      code: error instanceof AiProviderError ? error.code : "failed",
    });
    throw new AiCallFailed(diagnostics);
  }
  if (!system.deterministic)
    await recordUsage({
      projectId,
      model: null,
      requestedId: requested?.id ?? null,
      fallbackUsed: Boolean(requested),
      operation: call.operation,
      client: system,
      started,
      status: "succeeded",
    });
  if (requested && call.access) await recordFallback(call.access, requested, null);
  return {
    value,
    requested: requested ? { id: requested.id, label: label(requested) } : null,
    actual: { id: null, label: system.deterministic ? "rules" : system.config.model },
    source: system.deterministic ? "rules" : "system",
    fallbackUsed: Boolean(requested),
    deterministic: system.deterministic,
    diagnostics,
  };
}

const isAbort = (error: unknown) => (error as Error)?.name === "AbortError";

async function recordFallback(
  access: ProjectAccess,
  requested: CatalogModel | null,
  actual: CatalogModel | null,
) {
  const batch = new EventBatch();
  await batch.emit(db, {
    type: "MODEL_FALLBACK_USED",
    projectId: access.project.id,
    actorId: access.actor.id,
    entityType: "ai_model",
    entityId: actual?.id ?? null,
    data: {
      requested: requested ? label(requested) : null,
      actual: actual ? label(actual) : "rules",
      title: requested ? label(requested) : "",
    },
  });
  batch.flush();
}

export { MockAiProvider };
