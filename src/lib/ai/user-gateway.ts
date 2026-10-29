import "server-only";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { aiModels, aiProviders } from "@/lib/db/schema";
import {
  MODEL_CAPABILITIES,
  type ModelCapability,
  type ProviderAdapterId,
} from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { slugify } from "@/lib/interview/rules/profile";
import { allow } from "@/lib/rate-limit";
import { revokeCredential, storeCredential, withSecret } from "@/lib/secrets/service";
import { parse } from "@/lib/validation";
import { ADAPTERS } from "./adapters";
import { loadCatalog, platformSettings } from "./catalog";
import { checkBaseUrl } from "./control-plane";
import { displayNameFor, inferCapabilities, isChatModel } from "./model-capabilities";
import { modelUsable, policyAllows } from "./model-resolver";

/**
 * A person's own AI gateway (their OpenAI, Anthropic or Gemini key, or any OpenAI-compatible
 * endpoint), used from the Studio chat. It belongs to that person alone: nobody else can list it,
 * pick it or read its key, and the platform's own models never see it. The key is stored encrypted
 * and is never returned. The platform owner's "external providers" switch decides whether it may be
 * used at all.
 */

/** Adapters a person may use. The managed gateway of the platform is not one of them. */
export const OWN_ADAPTERS = [
  "openai",
  "anthropic",
  "gemini",
  "openai_compatible",
  "anthropic_compatible",
] as const satisfies readonly ProviderAdapterId[];

const MAX_MODELS = 30;

const addInput = z.object({
  name: z.string().trim().min(2).max(60),
  adapter: z.enum(OWN_ADAPTERS),
  baseUrl: z.string().trim().max(300).nullish(),
  /** Write-only. */
  secret: z.string().trim().min(8).max(500),
  /** Model ids to add. Empty: every chat model the key can see. */
  models: z.array(z.string().trim().min(1).max(120)).max(MAX_MODELS).default([]),
});

export interface MyGatewayModel {
  id: string;
  modelId: string;
  displayName: string;
  capabilities: ModelCapability[];
}
export interface MyGateway {
  id: string;
  name: string;
  adapter: ProviderAdapterId;
  baseUrl: string | null;
  status: string;
  models: MyGatewayModel[];
}
export interface MyGateways {
  gateways: MyGateway[];
  /** Whether the platform lets people use their own provider at all. */
  allowed: boolean;
}

export async function listMyGateways(actor: Actor): Promise<MyGateways> {
  const [rows, models, settings] = await Promise.all([
    db.select().from(aiProviders).where(eq(aiProviders.ownerUserId, actor.id)),
    db
      .select({
        id: aiModels.id,
        providerId: aiModels.providerId,
        modelId: aiModels.modelId,
        displayName: aiModels.displayName,
        capabilities: aiModels.capabilities,
      })
      .from(aiModels)
      .innerJoin(aiProviders, eq(aiProviders.id, aiModels.providerId))
      .where(eq(aiProviders.ownerUserId, actor.id)),
    platformSettings(),
  ]);
  return {
    allowed: settings.policy.allowExternalProviders,
    gateways: rows.map((p) => ({
      id: p.id,
      name: p.name,
      adapter: p.adapter,
      baseUrl: p.baseUrl,
      status: p.status,
      models: models.filter((m) => m.providerId === p.id).map(({ providerId: _p, ...m }) => m),
    })),
  };
}

/** What the chat's model picker offers this person: their own models that can answer right now. */
export async function chatModelOptions(
  actor: Actor,
): Promise<{ id: string; label: string; vision: boolean }[]> {
  const [catalog, settings] = await Promise.all([loadCatalog(db, actor.id), platformSettings()]);
  return catalog
    .filter((m) => m.ownerUserId === actor.id && modelUsable(m) && policyAllows(m, settings.policy))
    .filter((m) => m.capabilities.includes("text"))
    .map((m) => ({
      id: m.id,
      label: `${m.providerName} / ${m.displayName}`,
      vision: m.capabilities.includes("vision"),
    }));
}

/**
 * Checks the key against the provider first, then stores it and the chosen models. A key the
 * provider refuses is never stored.
 */
export async function addMyGateway(actor: Actor, raw: unknown) {
  const data = parse(addInput, raw);
  if (!(await allow(`own-gateway:${actor.id}`, 20, 60 * 60_000))) throw new AppError("RATE_LIMIT");
  if (!(await platformSettings()).policy.allowExternalProviders)
    throw new AppError("AUTHORIZATION_ERROR", "External providers are off", {
      gateway: "externalOff",
    });
  const adapter = ADAPTERS[data.adapter];
  await checkBaseUrl(data.adapter, data.baseUrl);
  const config = { baseUrl: data.baseUrl || null, configuration: {} };
  const test = await adapter.test(config, data.secret);
  if (!test.ok)
    throw new AppError("VALIDATION_ERROR", "The provider refused the key", {
      secret: test.code === "auth_failed" ? "refused" : "unreachable",
    });

  const seen = [...new Set(test.models ?? [])].filter(isChatModel);
  const chosen = data.models.length ? data.models : seen.slice(0, MAX_MODELS);
  if (chosen.length === 0)
    throw new AppError("VALIDATION_ERROR", "Name at least one model", { models: "required" });

  return db.transaction(async (tx) => {
    const base = `u-${actor.id.slice(0, 8)}-${slugify(data.name)}`.toLowerCase();
    const taken = new Set(
      (await tx.select({ slug: aiProviders.slug }).from(aiProviders)).map((r) => r.slug),
    );
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    const credentialId = await storeCredential(tx, {
      scope: "user",
      kind: "ai_provider",
      label: data.name,
      secret: data.secret,
      userId: actor.id,
      createdBy: actor.id,
    });
    const [provider] = await tx
      .insert(aiProviders)
      .values({
        slug,
        name: data.name,
        type: "custom",
        adapter: data.adapter,
        baseUrl: data.baseUrl || null,
        credentialId,
        ownerUserId: actor.id,
        status: "connected",
        lastTestedAt: new Date(),
      })
      .returning({ id: aiProviders.id });
    await tx.insert(aiModels).values(
      chosen.map((modelId) => ({
        providerId: provider.id,
        modelId,
        displayName: displayNameFor(modelId),
        capabilities: inferCapabilities(data.adapter, modelId).filter((c) =>
          MODEL_CAPABILITIES.includes(c),
        ),
      })),
    );
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "own_gateway.added",
      entityType: "ai_provider",
      entityId: provider.id,
      // Adapter and model ids only; never the key.
      metadata: { adapter: data.adapter, models: chosen.length },
    });
    return { id: provider.id, models: chosen.length };
  });
}

export async function removeMyGateway(actor: Actor, raw: unknown) {
  const { id } = parse(z.object({ id: z.uuid() }), raw);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(aiProviders)
      .where(and(eq(aiProviders.id, id), eq(aiProviders.ownerUserId, actor.id)));
    // Someone else's gateway looks exactly like one that does not exist.
    if (!row) throw new AppError("NOT_FOUND");
    if (row.credentialId) await revokeCredential(tx, row.credentialId);
    await tx.delete(aiProviders).where(eq(aiProviders.id, id));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "own_gateway.removed",
      entityType: "ai_provider",
      entityId: id,
      metadata: { adapter: row.adapter },
    });
  });
}

/** Re-checks the key of one of the person's gateways and updates its status. */
export async function testMyGateway(actor: Actor, raw: unknown) {
  const { id } = parse(z.object({ id: z.uuid() }), raw);
  const [row] = await db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.id, id), eq(aiProviders.ownerUserId, actor.id)));
  if (!row?.credentialId) throw new AppError("NOT_FOUND");
  const result = await withSecret(
    row.credentialId,
    { kind: "ai_provider", userId: actor.id },
    (secret) =>
      ADAPTERS[row.adapter].test(
        { baseUrl: row.baseUrl, configuration: row.configuration },
        secret,
      ),
  );
  await db
    .update(aiProviders)
    .set({
      status: result.ok ? "connected" : result.code === "auth_failed" ? "unauthorized" : "error",
      lastTestedAt: new Date(),
    })
    .where(eq(aiProviders.id, id));
  return { ok: result.ok, code: result.code };
}
