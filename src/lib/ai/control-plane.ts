import "server-only";
import { and, count, eq, ne } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import {
  agentModelMappings,
  agents,
  aiModels,
  aiProviders,
  mcpConnections,
  platformAiSettings,
  repositoryConnections,
} from "@/lib/db/schema";
import {
  AGENT_ROLES,
  MODEL_CAPABILITIES,
  MODEL_STATUSES,
  PROVIDER_ADAPTERS,
  PROVIDER_TYPES,
} from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { slugify } from "@/lib/interview/rules/profile";
import { assertSafeEndpoint } from "@/lib/net/endpoint-guard";
import { requirePlatformOwner } from "@/lib/platform/roles";
import { recordTest, revokeCredential, storeCredential, withSecret } from "@/lib/secrets/service";
import { parse } from "@/lib/validation";
import { ADAPTERS } from "./adapters";
import { loadCatalog, platformSettings } from "./catalog";
import { DEFAULT_POLICY, modelUsable, validateMapping } from "./model-resolver";

/**
 * Owner-only management of providers, models, defaults, agent mappings and policy. Every
 * change is audited; secrets go straight to the encrypted store and are never returned.
 */

const providerInput = z.object({
  name: z.string().trim().min(2).max(60),
  type: z.enum(PROVIDER_TYPES),
  adapter: z.enum(PROVIDER_ADAPTERS),
  baseUrl: z.string().trim().max(300).nullish(),
  /** Write-only. Empty keeps the current secret. */
  secret: z.string().trim().max(500).optional(),
});

export interface ProviderView {
  id: string;
  slug: string;
  name: string;
  type: (typeof PROVIDER_TYPES)[number];
  adapter: (typeof PROVIDER_ADAPTERS)[number];
  baseUrl: string | null;
  status: string;
  enabled: boolean;
  hasCredential: boolean;
  lastTestedAt: Date | null;
  modelCount: number;
}

export async function listProviders(actor: Actor): Promise<ProviderView[]> {
  await requirePlatformOwner(actor);
  const rows = await db.select().from(aiProviders).orderBy(aiProviders.name);
  const counts = await db
    .select({ providerId: aiModels.providerId, n: count() })
    .from(aiModels)
    .groupBy(aiModels.providerId);
  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    type: p.type,
    adapter: p.adapter,
    baseUrl: p.baseUrl,
    status: p.status,
    enabled: p.enabled,
    hasCredential: Boolean(p.credentialId),
    lastTestedAt: p.lastTestedAt,
    modelCount: counts.find((c) => c.providerId === p.id)?.n ?? 0,
  }));
}

async function checkBaseUrl(
  adapter: (typeof PROVIDER_ADAPTERS)[number],
  baseUrl: string | null | undefined,
) {
  if (ADAPTERS[adapter].requiresBaseUrl && !baseUrl)
    throw new AppError("VALIDATION_ERROR", "Base URL required", { baseUrl: "required" });
  if (baseUrl) await assertSafeEndpoint(baseUrl);
}

export async function createProvider(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const data = parse(providerInput, input);
  await checkBaseUrl(data.adapter, data.baseUrl);
  return db.transaction(async (tx) => {
    let slug = slugify(data.name) || "provider";
    const taken = new Set(
      (await tx.select({ slug: aiProviders.slug }).from(aiProviders)).map((r) => r.slug),
    );
    for (let n = 2; taken.has(slug); n++) slug = `${slugify(data.name)}-${n}`;
    const credentialId = data.secret
      ? await storeCredential(tx, {
          scope: "platform",
          kind: "ai_provider",
          label: data.name,
          secret: data.secret,
          createdBy: actor.id,
        })
      : null;
    const [row] = await tx
      .insert(aiProviders)
      .values({
        slug,
        name: data.name,
        type: data.type,
        adapter: data.adapter,
        baseUrl: data.baseUrl || null,
        credentialId,
      })
      .returning({ id: aiProviders.id });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "provider.created",
      entityType: "ai_provider",
      entityId: row.id,
      metadata: { name: data.name, adapter: data.adapter, credential: Boolean(credentialId) },
    });
    return { id: row.id };
  });
}

export async function updateProvider(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { id, ...data } = parse(providerInput.extend({ id: z.uuid() }), input);
  await checkBaseUrl(data.adapter, data.baseUrl);
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(aiProviders).where(eq(aiProviders.id, id));
    if (!current) throw new AppError("NOT_FOUND");
    let credentialId = current.credentialId;
    // A new secret replaces the old one; the old ciphertext is revoked, not kept active.
    if (data.secret) {
      if (credentialId) await revokeCredential(tx, credentialId);
      credentialId = await storeCredential(tx, {
        scope: "platform",
        kind: "ai_provider",
        label: data.name,
        secret: data.secret,
        createdBy: actor.id,
      });
    }
    await tx
      .update(aiProviders)
      .set({
        name: data.name,
        type: data.type,
        adapter: data.adapter,
        baseUrl: data.baseUrl || null,
        credentialId,
        status: "untested",
      })
      .where(eq(aiProviders.id, id));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: data.secret ? "provider.credential_rotated" : "provider.updated",
      entityType: "ai_provider",
      entityId: id,
      metadata: { name: data.name },
    });
  });
}

export async function setProviderEnabled(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { id, enabled } = parse(z.object({ id: z.uuid(), enabled: z.boolean() }), input);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(aiProviders)
      .set({ enabled, ...(enabled ? {} : { status: "disabled" as const }) })
      .where(eq(aiProviders.id, id))
      .returning({ name: aiProviders.name });
    if (!row) throw new AppError("NOT_FOUND");
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: enabled ? "provider.enabled" : "provider.disabled",
      entityType: "ai_provider",
      entityId: id,
      metadata: { name: row.name },
    });
  });
}

/** Revokes the credential and marks the provider disconnected. Models stay registered. */
export async function disconnectProvider(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { id } = parse(z.object({ id: z.uuid() }), input);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(aiProviders).where(eq(aiProviders.id, id));
    if (!row) throw new AppError("NOT_FOUND");
    if (row.credentialId) await revokeCredential(tx, row.credentialId);
    await tx
      .update(aiProviders)
      .set({ credentialId: null, status: "disconnected" })
      .where(eq(aiProviders.id, id));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "provider.disconnected",
      entityType: "ai_provider",
      entityId: id,
      metadata: { name: row.name },
    });
  });
}

/** Calls the provider with the stored secret. Only a safe code comes back, never the body. */
export async function testProvider(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { id } = parse(z.object({ id: z.uuid() }), input);
  const [row] = await db.select().from(aiProviders).where(eq(aiProviders.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  if (!row.credentialId)
    return { ok: false, code: "no_credential" as const, models: [] as string[] };
  const adapter = ADAPTERS[row.adapter];
  const result = await withSecret(row.credentialId, { kind: "ai_provider" }, (secret) =>
    adapter.test({ baseUrl: row.baseUrl, configuration: row.configuration }, secret),
  );
  const status = result.ok ? "connected" : result.code === "auth_failed" ? "unauthorized" : "error";
  await db.transaction(async (tx) => {
    await tx
      .update(aiProviders)
      .set({ status, lastTestedAt: new Date() })
      .where(eq(aiProviders.id, id));
    if (row.credentialId) await recordTest(tx, row.credentialId, result.code);
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: result.ok ? "provider.connected" : "provider.test_failed",
      entityType: "ai_provider",
      entityId: id,
      metadata: { name: row.name, code: result.code },
    });
  });
  return { ok: result.ok, code: result.code, models: result.models ?? [] };
}

const modelInput = z.object({
  providerId: z.uuid(),
  modelId: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(80),
  capabilities: z.array(z.enum(MODEL_CAPABILITIES)).max(MODEL_CAPABILITIES.length),
  contextWindow: z.int().min(1).max(10_000_000).nullish(),
});

export async function listModels(actor: Actor) {
  await requirePlatformOwner(actor);
  const [catalog, settings] = await Promise.all([loadCatalog(), platformSettings()]);
  return {
    models: catalog,
    defaultModelId: settings.defaultModelId,
    fallbackModelId: settings.fallbackModelId,
  };
}

export async function createModel(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const data = parse(modelInput, input);
  return db.transaction(async (tx) => {
    const [provider] = await tx
      .select({ id: aiProviders.id })
      .from(aiProviders)
      .where(eq(aiProviders.id, data.providerId));
    if (!provider) throw new AppError("NOT_FOUND");
    const [row] = await tx
      .insert(aiModels)
      .values({ ...data, contextWindow: data.contextWindow ?? null })
      .onConflictDoNothing()
      .returning({ id: aiModels.id });
    if (!row) throw new AppError("CONFLICT", "Model exists", { modelId: "exists" });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "model.created",
      entityType: "ai_model",
      entityId: row.id,
      metadata: { modelId: data.modelId },
    });
    return { id: row.id };
  });
}

export async function updateModel(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { id, ...data } = parse(
    modelInput
      .omit({ providerId: true, modelId: true })
      .extend({ id: z.uuid(), status: z.enum(MODEL_STATUSES).optional() }),
    input,
  );
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(aiModels)
      .set({ ...data, contextWindow: data.contextWindow ?? null })
      .where(eq(aiModels.id, id))
      .returning({ modelId: aiModels.modelId });
    if (!row) throw new AppError("NOT_FOUND");
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "model.updated",
      entityType: "ai_model",
      entityId: id,
      metadata: {
        modelId: row.modelId,
        status: data.status ?? null,
        capabilities: data.capabilities.join(","),
      },
    });
  });
}

export async function setDefaults(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const data = parse(
    z.object({ defaultModelId: z.uuid().nullable(), fallbackModelId: z.uuid().nullable() }),
    input,
  );
  const catalog = await loadCatalog();
  for (const [field, id] of Object.entries(data)) {
    // Unavailable models cannot become the default or fallback.
    if (id && !catalog.some((m) => m.id === id && modelUsable(m)))
      throw new AppError("VALIDATION_ERROR", "Model unavailable", { [field]: "unavailable" });
  }
  await db.transaction(async (tx) => {
    await platformSettings(tx);
    await tx
      .update(platformAiSettings)
      .set({ ...data, updatedBy: actor.id })
      .where(eq(platformAiSettings.id, 1));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "model.defaults_changed",
      entityType: "platform",
      metadata: { defaultModelId: data.defaultModelId, fallbackModelId: data.fallbackModelId },
    });
  });
}

const policyInput = z.object({
  allowedProviderIds: z.array(z.uuid()).nullable(),
  allowedModelIds: z.array(z.uuid()).nullable(),
  allowProjectOverride: z.boolean(),
  allowAgentOverride: z.boolean(),
  allowExternalProviders: z.boolean(),
});

export async function setPolicy(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const policy = parse(policyInput, input);
  await db.transaction(async (tx) => {
    await platformSettings(tx);
    await tx
      .update(platformAiSettings)
      .set({ policy, updatedBy: actor.id })
      .where(eq(platformAiSettings.id, 1));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "policy.changed",
      entityType: "platform",
      metadata: {
        allowProjectOverride: policy.allowProjectOverride,
        allowAgentOverride: policy.allowAgentOverride,
        allowExternalProviders: policy.allowExternalProviders,
        restrictedProviders: policy.allowedProviderIds?.length ?? null,
        restrictedModels: policy.allowedModelIds?.length ?? null,
      },
    });
  });
}

export async function getPolicy(actor: Actor) {
  await requirePlatformOwner(actor);
  return (await platformSettings()).policy ?? DEFAULT_POLICY;
}

const roleMappingInput = z.object({
  role: z.enum(AGENT_ROLES),
  primaryModelId: z.uuid().nullable(),
  fallbackModelId: z.uuid().nullable(),
  requiredCapabilities: z.array(z.enum(MODEL_CAPABILITIES)).default([]),
});

export async function listRoleMappings(actor: Actor) {
  await requirePlatformOwner(actor);
  return db.select().from(agentModelMappings).where(eq(agentModelMappings.scope, "platform"));
}

/** Saves a role → model mapping after checking the models support what the role needs. */
export async function setRoleMapping(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const data = parse(roleMappingInput, input);
  await db.transaction(async (tx) => {
    if (!data.primaryModelId) {
      await tx
        .delete(agentModelMappings)
        .where(
          and(
            eq(agentModelMappings.scope, "platform"),
            eq(agentModelMappings.agentRole, data.role),
          ),
        );
    } else {
      const check = validateMapping(await loadCatalog(tx), {
        primaryModelId: data.primaryModelId,
        fallbackModelId: data.fallbackModelId,
        requiredCapabilities: data.requiredCapabilities,
      });
      if (!check.ok)
        throw new AppError("VALIDATION_ERROR", "Invalid mapping", {
          [check.field]:
            check.reason === "capability" ? `capability:${check.missing?.join(",")}` : check.reason,
        });
      await tx
        .insert(agentModelMappings)
        .values({
          scope: "platform",
          agentRole: data.role,
          primaryModelId: data.primaryModelId,
          fallbackModelId: data.fallbackModelId,
          requiredCapabilities: data.requiredCapabilities,
        })
        .onConflictDoUpdate({
          target: [agentModelMappings.scope, agentModelMappings.agentRole],
          set: {
            primaryModelId: data.primaryModelId,
            fallbackModelId: data.fallbackModelId,
            requiredCapabilities: data.requiredCapabilities,
          },
        });
    }
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "agent_mapping.changed",
      entityType: "agent_role",
      entityId: data.role,
      metadata: { primaryModelId: data.primaryModelId, fallbackModelId: data.fallbackModelId },
    });
  });
}

/** Counts only: the Owner sees platform state, not other people's project contents. */
export async function controlPlaneOverview(actor: Actor) {
  await requirePlatformOwner(actor);
  const [providers, catalog, settings] = await Promise.all([
    db.select({ status: aiProviders.status, enabled: aiProviders.enabled }).from(aiProviders),
    loadCatalog(),
    platformSettings(),
  ]);
  const [[agentsN], [mcpN], [gitN]] = await Promise.all([
    db.select({ n: count() }).from(agents).where(eq(agents.connectionStatus, "connected")),
    db.select({ n: count() }).from(mcpConnections).where(eq(mcpConnections.status, "connected")),
    db
      .select({ n: count() })
      .from(repositoryConnections)
      .where(ne(repositoryConnections.status, "disconnected")),
  ]);
  return {
    activeProviders: providers.filter((p) => p.enabled && p.status === "connected").length,
    providers: providers.length,
    availableModels: catalog.filter(modelUsable).length,
    defaultModel: catalog.find((m) => m.id === settings.defaultModelId) ?? null,
    fallbackModel: catalog.find((m) => m.id === settings.fallbackModelId) ?? null,
    connectedAgents: agentsN.n,
    connectedMcp: mcpN.n,
    gitConnections: gitN.n,
  };
}
