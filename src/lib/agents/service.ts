import "server-only";
import { and, asc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { agents, projects } from "@/lib/db/schema";
import { AGENT_TYPES, type AgentType } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";

export type AgentView = typeof agents.$inferSelect;

export async function listAgents(access: ProjectAccess): Promise<AgentView[]> {
  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.projectId, access.project.id))
    .orderBy(asc(agents.createdAt));
  const order = (t: AgentType) => AGENT_TYPES.indexOf(t);
  return rows.sort((a, b) => order(a.type) - order(b.type));
}

/**
 * Agent configuration holds preferences only. Anything that looks like a credential is
 * rejected: secrets will live in an encrypted store when real connections arrive.
 */
const SECRET_LIKE = /key|token|secret|password|credential|auth/i;
const configurationInput = z
  .record(z.string().trim().min(1).max(40), z.string().trim().max(300))
  .refine((c) => Object.keys(c).length <= 10, "tooMany")
  .refine((c) => !Object.keys(c).some((k) => SECRET_LIKE.test(k)), "secret")
  // Values that look like provider keys (sk-..., ghp_..., long opaque strings) are refused too.
  .refine(
    (c) =>
      !Object.values(c).some((v) => /^(sk|pk|ghp|gho|xox[bp])[-_]|^[A-Za-z0-9_-]{40,}$/.test(v)),
    "secret",
  );

const preferInput = z.object({ type: z.enum(AGENT_TYPES) });

/** Marks one agent as the project's preferred builder. Nothing is executed or connected. */
export async function setPreferredAgent(actor: Actor, slug: string, input: unknown) {
  const { type } = parse(preferInput, input);
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const [target] = await tx
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.projectId, project.id), eq(agents.type, type)));
    if (!target) throw new AppError("NOT_FOUND");
    await tx
      .update(agents)
      .set({ status: "available" })
      .where(and(eq(agents.projectId, project.id), eq(agents.status, "pending")));
    await tx.update(agents).set({ status: "pending" }).where(eq(agents.id, target.id));
    await tx
      .update(projects)
      .set({ preferredAgent: type, buildStrategy: type === "saqina" ? "saqina" : "external" })
      .where(eq(projects.id, project.id));
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "agent.updated",
      entityType: "agent",
      entityId: target.id,
      metadata: { preferred: type },
    });
  });
}

export async function updateAgentConfiguration(actor: Actor, slug: string, input: unknown) {
  const { type, configuration } = parse(
    z.object({ type: z.enum(AGENT_TYPES), configuration: configurationInput }),
    input,
  );
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const [row] = await tx
      .update(agents)
      .set({ configuration })
      .where(and(eq(agents.projectId, project.id), eq(agents.type, type)))
      .returning({ id: agents.id });
    if (!row) throw new AppError("NOT_FOUND");
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "agent.updated",
      entityType: "agent",
      entityId: row.id,
      metadata: { type, keys: Object.keys(configuration).join(",") },
    });
  });
}
