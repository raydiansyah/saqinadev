import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { FORBIDDEN_PERMISSIONS } from "@/lib/agents/capabilities";
import type { Executor } from "@/lib/db/client";
import { agentDefinitions, agents } from "@/lib/db/schema";
import type { AgentCapability, AgentPermission } from "@/lib/domain/enums";
import type { AgentDefinitionRole } from "@/lib/domain/executions";
import { type AgentDefinitionRow, ensurePresets } from "./service";

/** What each kind of agent is good at, for the selector. Permissions come from the definition. */
const ROLE_CAPABILITIES: Record<AgentDefinitionRole, AgentCapability[]> = {
  planner: ["planning", "research", "documentation"],
  architect: ["planning", "backend", "frontend", "code_review"],
  backend: ["backend", "database", "security", "testing"],
  frontend: ["frontend", "testing", "code_review", "browser"],
  database: ["database", "backend"],
  qa: ["testing", "code_review", "browser", "security"],
  reviewer: ["code_review", "security"],
  devops: ["backend", "testing"],
  docs: ["documentation", "research"],
  custom: ["planning"],
};

const grantable = (permissions: AgentPermission[]) =>
  permissions.filter((p) => !FORBIDDEN_PERMISSIONS.includes(p));

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Makes sure the project has one agent for each active definition and keeps their permissions
 * in line with it. The five template agents are adopted, not duplicated. Idempotent and lazy
 * like `ensureTeamAgents`, so it only writes when something differs.
 */
export async function ensureDefinitionAgents(executor: Executor, projectId: string) {
  let defs = await executor
    .select()
    .from(agentDefinitions)
    .where(ne(agentDefinitions.status, "archived"));
  if (defs.length === 0) {
    await ensurePresets(executor, null);
    defs = await executor
      .select()
      .from(agentDefinitions)
      .where(ne(agentDefinitions.status, "archived"));
  }
  const mine = await executor
    .select()
    .from(agents)
    .where(and(eq(agents.projectId, projectId), eq(agents.type, "saqina")));
  const linked = new Map(mine.filter((a) => a.definitionId).map((a) => [a.definitionId, a]));
  const unlinked = mine.filter((a) => !a.definitionId);

  const create: Array<typeof agents.$inferInsert> = [];
  for (const def of defs) {
    const values = {
      capabilities: ROLE_CAPABILITIES[def.role],
      permissions: grantable(def.permissions),
      priority: def.priority,
      definitionId: def.id,
    };
    const have = linked.get(def.id);
    if (have) {
      if (
        !same(have.permissions, values.permissions) ||
        !same(have.capabilities, values.capabilities) ||
        have.priority !== values.priority
      )
        await executor.update(agents).set(values).where(eq(agents.id, have.id));
      continue;
    }
    if (def.status !== "active") continue;
    const adopt =
      unlinked.find((a) => a.role === def.role) ?? unlinked.find((a) => a.name === def.name);
    if (adopt) {
      unlinked.splice(unlinked.indexOf(adopt), 1);
      await executor.update(agents).set(values).where(eq(agents.id, adopt.id));
    } else {
      create.push({
        projectId,
        name: def.name,
        type: "saqina",
        role: def.role,
        provider: "Saqina",
        status: "available",
        ...values,
      });
    }
  }
  if (create.length > 0) await executor.insert(agents).values(create).onConflictDoNothing();
}

/** Whether the definition behind an agent accepts new work. An agent without one always does. */
export async function definitionAcceptsWork(
  executor: Executor,
  definitionId: string | null,
): Promise<boolean> {
  if (!definitionId) return true;
  const [row] = await executor
    .select({ status: agentDefinitions.status })
    .from(agentDefinitions)
    .where(eq(agentDefinitions.id, definitionId));
  return row?.status === "active";
}

export type { AgentDefinitionRow };
