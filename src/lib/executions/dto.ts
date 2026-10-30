import type { ExecutionBudget, ExecutionStatus } from "@/lib/domain/executions";
import type { AgentView, ExecutionViewModel, TaskView } from "./view";

/**
 * What the browser gets: plain JSON, no database rows. The Studio keeps this as a copy of what the
 * server said at event number `seq`; it never decides a status itself.
 */
export interface MessageDTO {
  id: string;
  type: string;
  taskId: string | null;
  fromAgentId: string | null;
  toAgentId: string | null;
  body: string;
  createdAt: string;
}

export interface ArtifactDTO {
  id: string;
  taskId: string | null;
  kind: string;
  path: string | null;
  commitSha: string | null;
  summary: string;
  createdAt: string;
}

export interface EventDTO {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ExecutionDTO {
  id: string;
  mode: "plan" | "build";
  request: string;
  status: ExecutionStatus;
  planVersion: number;
  branch: string | null;
  goal: string | null;
  risks: string[];
  errorSummary: string | null;
  cancelRequested: boolean;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  /** Number of the last event this copy includes. */
  seq: number;
  budget: ExecutionBudget;
  tasks: TaskView[];
  agents: AgentView[];
  messages: MessageDTO[];
  artifacts: ArtifactDTO[];
  progress: { done: number; total: number };
}

export interface ExecutionSnapshotDTO {
  execution: ExecutionDTO;
  /** The most recent events, oldest first, for the activity list. */
  events: EventDTO[];
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toExecutionDTO(view: ExecutionViewModel): ExecutionDTO {
  const e = view.execution;
  const plan = e.plan as { goal?: unknown; risks?: unknown };
  return {
    id: e.id,
    mode: e.mode,
    request: e.request,
    status: e.status,
    planVersion: e.planVersion,
    branch: e.branch,
    goal: typeof plan.goal === "string" ? plan.goal : null,
    risks: Array.isArray(plan.risks) ? plan.risks.map(String) : [],
    errorSummary: e.errorSummary,
    cancelRequested: e.cancelRequestedAt !== null,
    startedAt: iso(e.startedAt),
    endedAt: iso(e.endedAt),
    createdAt: e.createdAt.toISOString(),
    seq: e.seq,
    budget: e.budget,
    tasks: view.tasks,
    agents: view.agents,
    messages: view.messages.map((m) => ({
      id: m.id,
      type: m.type,
      taskId: m.taskId,
      fromAgentId: m.fromAgentId,
      toAgentId: m.toAgentId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
    artifacts: view.artifacts.map((a) => ({
      id: a.id,
      taskId: a.taskId,
      kind: a.kind,
      path: a.path,
      commitSha: a.commitSha,
      summary: a.summary,
      createdAt: a.createdAt.toISOString(),
    })),
    progress: view.progress,
  };
}
