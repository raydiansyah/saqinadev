import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import { listAgentRegistry } from "@/lib/agents/registry";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { agentModelMappings, agents, projectSettings } from "@/lib/db/schema";
import { AGENT_TYPES } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";
import { resolutionInput } from "./catalog";
import { modelUsable, policyAllows, resolveModel } from "./model-resolver";

/** What the project AI section shows: choices the policy allows and the result per agent. */
export async function projectAiView(access: ProjectAccess) {
  const base = await resolutionInput({ projectId: access.project.id });
  const policy = base.platform.policy;
  const options = base.catalog.filter((m) => modelUsable(m) && policyAllows(m, policy));
  const { agents } = await listAgentRegistry(access);
  const team = agents.filter((a) => a.type === "saqina");
  const resolved = await Promise.all(
    team.map(async (agent) => {
      const input = await resolutionInput({
        projectId: access.project.id,
        agent: { id: agent.id, role: agent.role },
      });
      const first = resolveModel(input).chain[0];
      return {
        agent: agent.name,
        model: first ? `${first.model.providerName} / ${first.model.displayName}` : null,
        source: first?.source ?? "none",
      };
    }),
  );
  return {
    allowProjectOverride: policy.allowProjectOverride,
    allowAgentOverride: policy.allowAgentOverride,
    preferredModelId: base.project?.preferredModelId ?? null,
    allowAgentOverrides: base.project?.allowAgentOverrides ?? true,
    options: options.map((m) => ({ id: m.id, label: `${m.providerName} / ${m.displayName}` })),
    resolved,
  };
}

const input = z.object({ preferredModelId: z.uuid().nullable(), allowAgentOverrides: z.boolean() });

/** Project-level choice, only within what the platform policy allows. */
export async function setProjectAiSettings(actor: Actor, slug: string, raw: unknown) {
  const data = parse(input, raw);
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  const base = await resolutionInput({ projectId: access.project.id });
  if (data.preferredModelId) {
    if (!base.platform.policy.allowProjectOverride)
      throw new AppError("AUTHORIZATION_ERROR", "Policy");
    const model = base.catalog.find((m) => m.id === data.preferredModelId);
    if (!model || !modelUsable(model) || !policyAllows(model, base.platform.policy))
      throw new AppError("VALIDATION_ERROR", "Model unavailable", {
        preferredModelId: "unavailable",
      });
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(projectSettings)
      .values({ projectId: access.project.id, ...data })
      .onConflictDoUpdate({ target: projectSettings.projectId, set: data });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "project.model_settings",
      entityType: "project",
      entityId: access.project.id,
      metadata: {
        preferredModelId: data.preferredModelId,
        allowAgentOverrides: data.allowAgentOverrides,
      },
    });
  });
}

export async function getProjectSettingsRow(projectId: string) {
  const [row] = await db
    .select()
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId));
  return row ?? null;
}

export interface AgentModelChoice {
  /** Models already set up by the platform owner that this project may use. */
  options: { id: string; label: string }[];
  /** What "Automatic" picks today for Saqina agents, as a label; null when nothing is usable. */
  automatic: string | null;
  /** Whether policy lets a project pin a model for its own agents. */
  canPin: boolean;
  /** The pinned model per agent type, or null for Automatic. */
  current: Partial<Record<(typeof AGENT_TYPES)[number], string | null>>;
}

const label = (m: { providerName: string; displayName: string }) =>
  `${m.providerName} / ${m.displayName}`;

/**
 * The model choice in agent settings: only models that are set up, usable and allowed, never a
 * typed name. "Automatic" means the resolver decides (project, then platform defaults).
 */
export async function agentModelChoice(access: ProjectAccess): Promise<AgentModelChoice> {
  const base = await resolutionInput({ projectId: access.project.id });
  const policy = base.platform.policy;
  const allowed = base.project?.allowedModelIds ?? null;
  const options = base.catalog.filter(
    (m) => modelUsable(m) && policyAllows(m, policy) && (!allowed || allowed.includes(m.id)),
  );
  const first = resolveModel(base).chain[0];
  const rows = await db
    .select({
      type: agents.type,
      configuration: agents.configuration,
      model: agentModelMappings.primaryModelId,
    })
    .from(agents)
    .leftJoin(agentModelMappings, eq(agentModelMappings.agentId, agents.id))
    .where(and(eq(agents.projectId, access.project.id), eq(agents.role, "general")));
  const current: AgentModelChoice["current"] = {};
  for (const r of rows) {
    current[r.type] =
      r.type === "saqina"
        ? (r.model ?? null)
        : (options.find((m) => m.modelId === r.configuration.model)?.id ?? null);
  }
  return {
    options: options.map((m) => ({ id: m.id, label: label(m) })),
    automatic: first ? label(first.model) : null,
    canPin: policy.allowAgentOverride && (base.project?.allowAgentOverrides ?? true),
    current,
  };
}

const agentModelInput = z.object({ type: z.enum(AGENT_TYPES), modelId: z.uuid().nullable() });

/**
 * Pins a model for an agent, or back to Automatic (null). For Saqina's own agents this writes the
 * project mapping the resolver reads, for every Saqina agent in the project (the general one and
 * the role team), so the choice is what actually runs. An outside agent (Claude, Codex, ...)
 * runs in its own tool: the choice is recorded as its preferred model for handoffs.
 */
export async function setAgentModel(actor: Actor, slug: string, raw: unknown) {
  const { type, modelId } = parse(agentModelInput, raw);
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  const base = await resolutionInput({ projectId: access.project.id });
  const model = modelId ? base.catalog.find((m) => m.id === modelId) : null;
  if (modelId) {
    const allowed = base.project?.allowedModelIds ?? null;
    if (
      !model ||
      !modelUsable(model) ||
      !policyAllows(model, base.platform.policy) ||
      (allowed && !allowed.includes(model.id))
    )
      throw new AppError("VALIDATION_ERROR", "Model unavailable", { modelId: "unavailable" });
  }
  if (
    type === "saqina" &&
    modelId &&
    !(base.platform.policy.allowAgentOverride && (base.project?.allowAgentOverrides ?? true))
  )
    throw new AppError("AUTHORIZATION_ERROR", "Policy");

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: agents.id, role: agents.role, configuration: agents.configuration })
      .from(agents)
      .where(and(eq(agents.projectId, access.project.id), eq(agents.type, type)));
    if (rows.length === 0) throw new AppError("NOT_FOUND");
    if (type === "saqina") {
      const ids = rows.map((r) => r.id);
      if (!model)
        await tx.delete(agentModelMappings).where(inArray(agentModelMappings.agentId, ids));
      else
        await tx
          .insert(agentModelMappings)
          .values(
            ids.map((agentId) => ({
              scope: "project" as const,
              projectId: access.project.id,
              agentId,
              agentRole: null,
              primaryModelId: model.id,
            })),
          )
          .onConflictDoUpdate({
            target: agentModelMappings.agentId,
            set: { primaryModelId: model.id, fallbackModelId: null },
          });
    } else {
      const general = rows.find((r) => r.role === "general") ?? rows[0];
      const { model: _old, ...rest } = general.configuration;
      await tx
        .update(agents)
        .set({ configuration: model ? { ...rest, model: model.modelId } : rest })
        .where(eq(agents.id, general.id));
    }
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "agent.model_set",
      entityType: "agent",
      entityId: rows[0].id,
      metadata: { type, modelId: model?.id ?? null },
    });
  });
}
