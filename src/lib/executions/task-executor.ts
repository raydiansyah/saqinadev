import type { AiProvider } from "@/lib/ai/provider";
import type { ProjectAccess } from "@/lib/auth/permissions";
import type { AgentMessageType, ExecutionArtifactKind } from "@/lib/domain/executions";
import type { AgentRow, DefinitionSnapshot, ExecutionRow, TaskRow } from "./types";

export interface ArtifactInput {
  kind: ExecutionArtifactKind;
  path?: string | null;
  commitSha?: string | null;
  summary: string;
  data?: Record<string, unknown>;
}

/** What one earlier task handed over. It is data for the next agent, never an instruction. */
export interface TaskInputFromDependency {
  taskId: string;
  title: string;
  role: string | null;
  summary: string;
  artifacts: Array<{
    kind: ExecutionArtifactKind;
    path: string | null;
    commitSha: string | null;
    summary: string;
  }>;
}

export interface TaskInput {
  execution: ExecutionRow;
  task: TaskRow;
  agent: AgentRow;
  definition: DefinitionSnapshot;
  access: ProjectAccess;
  /** This is try number `attempt`; a retry may carry the reason the last try failed. */
  attempt: number;
  previousError: string | null;
  inputs: TaskInputFromDependency[];
  /** Messages other agents sent about this task: review feedback, answers, decisions. */
  messages: Array<{ type: AgentMessageType; from: string | null; body: string }>;
  /** Aborts when the time limit passes or the execution is cancelled. */
  signal: AbortSignal;
  provider?: AiProvider;
}

export interface OutgoingMessage {
  /** Key of the receiving agent's definition. It must be one this agent may hand work to. */
  to: string;
  type: AgentMessageType;
  body: string;
}

export type TaskResult =
  | {
      outcome: "succeeded";
      summary: string;
      artifacts: ArtifactInput[];
      messages?: OutgoingMessage[];
    }
  | { outcome: "failed"; error: string; retryable: boolean; summary?: string }
  /** The reviewer found defects in the work of `targetTaskId`. Nothing is marked done. */
  | {
      outcome: "review_failed";
      summary: string;
      findings: string;
      targetTaskId: string;
      artifacts?: ArtifactInput[];
    };

/**
 * Does the work of one task and says what came of it. The engine decides what that means for
 * the task, the execution and the next agent; the executor never moves state itself.
 */
export type TaskExecutor = (input: TaskInput) => Promise<TaskResult>;

export interface EngineOptions {
  /** Tests inject a model instead of the catalog. */
  provider?: AiProvider;
  taskExecutor?: TaskExecutor;
}
