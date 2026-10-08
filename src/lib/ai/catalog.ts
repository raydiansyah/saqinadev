import "server-only";
import { and, eq, or } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import {
  agentModelMappings,
  aiModels,
  aiProviders,
  platformAiSettings,
  projectSettings,
} from "@/lib/db/schema";
import type { AgentRole } from "@/lib/domain/enums";
import {
  type CatalogModel,
  DEFAULT_POLICY,
  type Mapping,
  type Policy,
  type ResolveInput,
} from "./model-resolver";

export async function loadCatalog(executor: Executor = db): Promise<CatalogModel[]> {
  return executor
    .select({
      id: aiModels.id,
      providerId: aiModels.providerId,
      modelId: aiModels.modelId,
      displayName: aiModels.displayName,
      capabilities: aiModels.capabilities,
      status: aiModels.status,
      providerName: aiProviders.name,
      providerType: aiProviders.type,
      providerAdapter: aiProviders.adapter,
      providerEnabled: aiProviders.enabled,
      providerStatus: aiProviders.status,
    })
    .from(aiModels)
    .innerJoin(aiProviders, eq(aiProviders.id, aiModels.providerId))
    .orderBy(aiProviders.name, aiModels.displayName);
}

/** The singleton settings row, created on first read. */
type SettingsRow = typeof platformAiSettings.$inferSelect;

export async function platformSettings(
  executor: Executor = db,
): Promise<SettingsRow & { policy: Policy }> {
  const [row] = await executor
    .select()
    .from(platformAiSettings)
    .where(eq(platformAiSettings.id, 1));
  if (row) return { ...row, policy: { ...DEFAULT_POLICY, ...row.policy } as Policy };
  const [created] = await executor
    .insert(platformAiSettings)
    .values({ id: 1, policy: DEFAULT_POLICY })
    .onConflictDoNothing()
    .returning();
  return created ? { ...created, policy: DEFAULT_POLICY } : platformSettings(executor);
}

/** Everything the resolver needs for one request, loaded with a few targeted queries. */
export async function resolutionInput(options: {
  projectId?: string | null;
  agent?: { id: string; role: AgentRole } | null;
}): Promise<Omit<ResolveInput, "required">> {
  const [catalog, settings, project, mappings] = await Promise.all([
    loadCatalog(),
    platformSettings(),
    options.projectId
      ? db
          .select({
            preferredModelId: projectSettings.preferredModelId,
            allowedModelIds: projectSettings.allowedModelIds,
            allowAgentOverrides: projectSettings.allowAgentOverrides,
          })
          .from(projectSettings)
          .where(eq(projectSettings.projectId, options.projectId))
          .then((r) => r[0] ?? null)
      : null,
    options.agent
      ? db
          .select()
          .from(agentModelMappings)
          .where(
            or(
              eq(agentModelMappings.agentId, options.agent.id),
              and(
                eq(agentModelMappings.scope, "platform"),
                eq(agentModelMappings.agentRole, options.agent.role),
              ),
            ),
          )
      : [],
  ]);
  // Project mapping (specific agent) outranks the platform mapping for the role.
  const ordered: Mapping[] = [...mappings]
    .sort((a, b) => (a.scope === b.scope ? 0 : a.scope === "project" ? -1 : 1))
    .map((m) => ({
      primaryModelId: m.primaryModelId,
      fallbackModelId: m.fallbackModelId,
      requiredCapabilities: m.requiredCapabilities,
    }));
  return {
    catalog,
    platform: {
      defaultModelId: settings.defaultModelId,
      fallbackModelId: settings.fallbackModelId,
      policy: settings.policy,
    },
    project,
    agentMappings: ordered,
  };
}
