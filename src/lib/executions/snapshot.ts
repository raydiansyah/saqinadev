import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import type { AgentDefinitionRow } from "@/lib/agent-definitions/service";
import type { Executor } from "@/lib/db/client";
import { agents } from "@/lib/db/schema";
import type { AgentRow, DefinitionSnapshot, ExecutionRow } from "./types";

/** The part of a definition an execution keeps. Frozen at the start: later edits never reach it. */
export const toDefinitionSnapshot = (row: AgentDefinitionRow): DefinitionSnapshot => ({
  id: row.id,
  key: row.key,
  name: row.name,
  role: row.role,
  version: row.version,
  instructions: row.instructions,
  responsibilities: row.responsibilities,
  allowedScope: row.allowedScope,
  forbidden: row.forbidden,
  definitionOfDone: row.definitionOfDone,
  inputRequirements: row.inputRequirements,
  expectedOutput: row.expectedOutput,
  tools: row.tools,
  permissions: row.permissions,
  handoffTargets: row.handoffTargets,
  maxAttempts: row.maxAttempts,
  timeoutMs: row.timeoutMs,
  priority: row.priority,
  modelId: row.modelId,
});

export const definitionsOf = (execution: ExecutionRow): Record<string, DefinitionSnapshot> =>
  ((execution.agentSnapshot as { definitions?: Record<string, DefinitionSnapshot> }).definitions ??
    {}) as Record<string, DefinitionSnapshot>;

export interface TeamMember {
  agent: AgentRow;
  definition: DefinitionSnapshot;
}

/**
 * The project's agents that follow a definition this execution froze, best first. An agent whose
 * definition was created after the execution began is not part of it.
 */
export async function executionTeam(
  executor: Executor,
  execution: ExecutionRow,
): Promise<TeamMember[]> {
  const frozen = definitionsOf(execution);
  const rows = await executor
    .select()
    .from(agents)
    .where(and(eq(agents.projectId, execution.projectId), isNotNull(agents.definitionId)));
  return rows
    .filter((a) => a.status !== "disabled" && a.definitionId && frozen[a.definitionId])
    .map((agent) => ({ agent, definition: frozen[agent.definitionId as string] }))
    .sort((a, b) => b.definition.priority - a.definition.priority);
}
