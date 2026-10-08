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
import { MockAiProvider } from "./mock";
import { type CatalogModel, resolveModel } from "./model-resolver";
import type { AiProvider } from "./provider";
import { getAiProvider } from "./registry";

export type ResolvedSource =
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
}

export interface AiCall<T> {
  access?: ProjectAccess | null;
  agent?: { id: string; role: AgentRole } | null;
  operation: AiOperation;
  required?: ModelCapability[];
  /** Does the work with whichever client the gateway hands over. Throwing tries the next model. */
  run: (client: AiProvider) => Promise<T>;
  /** Tests inject a provider instead of the catalog. */
  override?: AiProvider;
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
  if (projectId && !allow(`ai:${projectId}`, 120, 60_000)) throw new AppError("RATE_LIMIT");

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
    };
  }

  const input = await resolutionInput({ projectId, agent: call.agent ?? null });
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

  for (const [index, candidate] of resolution.chain.entries()) {
    const provider = providers.find((p) => p.id === candidate.model.providerId);
    if (!provider?.credentialId) continue;
    const started = performance.now();
    let client: AiProvider | null = null;
    try {
      const value = await withSecret(provider.credentialId, { kind: "ai_provider" }, (secret) => {
        client = ADAPTERS[provider.adapter].createClient(
          { baseUrl: provider.baseUrl, configuration: provider.configuration },
          secret,
          candidate.model.modelId,
        );
        return call.run(client);
      });
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
      log.warn("ai.candidate_failed", { model: candidate.model.modelId, code });
    }
  }

  // Nothing configured worked: the env model if present, otherwise rules. Recorded either way.
  const system = getAiProvider();
  const started = performance.now();
  const value = await call.run(system);
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
