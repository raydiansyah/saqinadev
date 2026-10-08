import "server-only";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { listAgentRegistry } from "@/lib/agents/registry";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { projectSettings } from "@/lib/db/schema";
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
