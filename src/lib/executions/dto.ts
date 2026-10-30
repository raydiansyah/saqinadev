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

/** The changes of the work branch against its base, as the repository host reports them. */
export interface ExecutionDiffDTO {
  /** `ok`: the host answered. The rest say plainly why there is nothing to show. */
  status: "ok" | "no_branch" | "no_repository" | "unsupported" | "error";
  code?: string;
  base?: string;
  head?: string;
  aheadBy: number;
  files: Array<{
    path: string;
    status: "added" | "modified" | "removed" | "renamed";
    additions: number;
    deletions: number;
    patch: string | null;
  }>;
  commits: Array<{ sha: string; message: string }>;
  truncated: boolean;
}

export type StageState = "done" | "pending" | "blocked" | "unknown";

/** Where the work stands on the way from code to a published site. Each stage says what it knows. */
export interface DeliveryDTO {
  repository: { provider: string; fullName: string } | null;
  branch: string | null;
  ci: {
    status: "none" | "running" | "passed" | "failed";
    runs: Array<{
      name: string;
      status: string;
      conclusion: string | null;
      url: string | null;
      updatedAt: string;
    }>;
  };
  preview: {
    status: "no_commits" | "none_yet" | "pending" | "ready" | "failed";
    url: string | null;
    updatedAt: string | null;
  };
  /** The last commit an agent made on the branch, from the host's own answer. */
  lastCommit: { sha: string; at: string } | null;
  stages: Array<{
    key: "source" | "build" | "preview" | "deploy" | "published";
    state: StageState;
    detail: string | null;
  }>;
}
