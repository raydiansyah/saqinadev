import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db, type Executor } from "@/lib/db/client";
import { agentRuns, agents } from "@/lib/db/schema";
import type { AgentRole, AgentType } from "@/lib/domain/enums";
import { ROLE_TEMPLATES, TOOL_CAPABILITIES } from "./capabilities";
import { ACTIVE_RUN_STATUSES } from "./state";

export type AgentRow = typeof agents.$inferSelect;

const ROLE_NAMES: Record<Exclude<AgentRole, "general">, string> = {
  planner: "Planner",
  frontend: "Frontend Developer",
  backend: "Backend Developer",
  qa: "QA Engineer",
  docs: "Docs Writer",
};

/** Agent types that can execute in this environment. External tools are not connected yet. */
export const EXECUTABLE_TYPES: readonly AgentType[] = ["saqina"];

/**
 * Makes sure the project has its specialist team. Idempotent and lazy, so projects created
 * before Phase 3 get the team the first time anyone needs it, without a data migration.
 */
export async function ensureTeamAgents(executor: Executor, projectId: string): Promise<void> {
  await executor
    .insert(agents)
    .values(
      ROLE_TEMPLATES.map((t) => ({
        projectId,
        name: ROLE_NAMES[t.role as Exclude<AgentRole, "general">],
        type: "saqina" as const,
        role: t.role,
        provider: "Saqina",
        status: "available" as const,
        capabilities: t.capabilities,
        permissions: t.permissions,
        priority: t.priority,
      })),
    )
    .onConflictDoNothing();
  // Tool agents from Phase 2 have no capabilities stored; describe what they could do.
  for (const [type, capabilities] of Object.entries(TOOL_CAPABILITIES)) {
    await executor
      .update(agents)
      .set({ capabilities })
      .where(
        and(
          eq(agents.projectId, projectId),
          eq(agents.type, type as AgentType),
          eq(agents.role, "general"),
          sql`${agents.capabilities} = '[]'::jsonb`,
        ),
      );
  }
}

/** Every agent in the project (team first), plus how many active runs each has. */
export async function listAgentRegistry(access: ProjectAccess) {
  await ensureTeamAgents(db, access.project.id);
  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.projectId, access.project.id))
    .orderBy(asc(agents.createdAt));
  const load = await db
    .select({ agentId: agentRuns.agentId, status: agentRuns.status })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.projectId, access.project.id),
        inArray(agentRuns.status, [...ACTIVE_RUN_STATUSES]),
      ),
    );
  const counts: Record<string, number> = {};
  for (const r of load) counts[r.agentId] = (counts[r.agentId] ?? 0) + 1;
  const team = rows.filter((a) => a.type === "saqina" && a.role !== "general");
  const tools = rows.filter((a) => !(a.type === "saqina" && a.role !== "general"));
  return { agents: [...team, ...tools], load: counts };
}
