import type { agentRuns, agents, executions, tasks } from "@/lib/db/schema";

export type ExecutionRow = typeof executions.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type RunRow = typeof agentRuns.$inferSelect;
export type AgentRow = typeof agents.$inferSelect;

/** Where an event or a row belongs. Every query in the engine is scoped by both ids. */
export interface Scope {
  executionId: string;
  projectId: string;
}

export const scopeOf = (execution: ExecutionRow): Scope => ({
  executionId: execution.id,
  projectId: execution.projectId,
});

/** The part of an agent definition an execution froze at its start. */
export interface DefinitionSnapshot {
  id: string;
  key: string;
  name: string;
  role: string;
  version: number;
  instructions: string;
  responsibilities: string[];
  allowedScope: string[];
  forbidden: string[];
  definitionOfDone: string[];
  inputRequirements: string;
  expectedOutput: string;
  tools: string[];
  permissions: string[];
  handoffTargets: string[];
  maxAttempts: number;
  timeoutMs: number;
  priority: number;
  modelId: string | null;
}
