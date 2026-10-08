import type {
  DocumentStatus,
  InterviewStatus,
  ProjectStatus,
  TaskStatus,
} from "@/lib/domain/enums";

/** The facts about a project that decide its stage and next action. Cheap to query. */
export interface ProjectSnapshot {
  slug: string;
  status: ProjectStatus;
  interviewStatus: InterviewStatus | null;
  unknownRequirements: number;
  conflictingRequirements: number;
  prdStatus: DocumentStatus | null;
  tasks: Record<TaskStatus, number>;
  /** Human decisions the orchestration layer is waiting on. Absent means none. */
  attention?: ProjectAttention;
}

export interface ProjectAttention {
  pendingProposals: number;
  activeRuns: number;
  waitingRuns: number;
  failedRuns: number;
}

export const NO_ATTENTION: ProjectAttention = {
  pendingProposals: 0,
  activeRuns: 0,
  waitingRuns: 0,
  failedRuns: 0,
};

/** Items that need a person: approvals, failed agent runs and blocked tasks. */
export function attentionCount(s: ProjectSnapshot): number {
  const a = s.attention ?? NO_ATTENTION;
  return a.pendingProposals + a.failedRuns + s.tasks.blocked;
}

export const EMPTY_TASK_COUNTS: Record<TaskStatus, number> = {
  backlog: 0,
  todo: 0,
  in_progress: 0,
  review: 0,
  done: 0,
  blocked: 0,
};

export const PIPELINE = [
  "understand",
  "requirements",
  "planning",
  "build",
  "review",
  "deploy",
] as const;
export type PipelineStage = (typeof PIPELINE)[number];
export type StageState = "done" | "current" | "upcoming";

const totalTasks = (t: Record<TaskStatus, number>) => Object.values(t).reduce((a, b) => a + b, 0);

/**
 * Semantic progress derived from real state, never a made-up percentage.
 * Deploy stays upcoming in Phase 2: there is no deployment yet.
 */
export function pipelineStages(s: ProjectSnapshot): Record<PipelineStage, StageState> {
  const understood = s.interviewStatus === "completed";
  const requirementsDone = understood && s.conflictingRequirements === 0 && s.prdStatus !== null;
  const planned = requirementsDone && s.prdStatus === "approved";
  const started = s.tasks.in_progress + s.tasks.review + s.tasks.done > 0;
  const total = totalTasks(s.tasks);
  const allDone = total > 0 && s.tasks.done === total;

  const state: Record<PipelineStage, StageState> = {
    understand: understood ? "done" : "current",
    requirements: requirementsDone ? "done" : understood ? "current" : "upcoming",
    planning: planned ? "done" : requirementsDone ? "current" : "upcoming",
    build: allDone ? "done" : planned || started ? "current" : "upcoming",
    review: allDone ? "done" : s.tasks.review > 0 ? "current" : "upcoming",
    deploy: "upcoming",
  };
  // Only one stage reads as current: the earliest unfinished one.
  const first = PIPELINE.find((p) => state[p] === "current");
  for (const p of PIPELINE) if (state[p] === "current" && p !== first) state[p] = "upcoming";
  return state;
}

export type NextActionKind =
  | "continueInterview"
  | "resolveBlocker"
  | "resolveConflicts"
  | "resolveOpenQuestions"
  | "reviewPrd"
  | "reviewPlan"
  | "startFirstTask"
  | "reviewWork"
  | "continueBuilding"
  | "restoreProject"
  | "reviewProposal"
  | "inspectAgentFailure";

export interface NextAction {
  kind: NextActionKind;
  /** Workspace path relative to /project/[slug]. */
  path: string;
}

/** The single most useful next step. Order encodes priority; UI never re-derives it. */
export function getNextProjectAction(s: ProjectSnapshot): NextAction {
  if (s.status === "archived") return { kind: "restoreProject", path: "/settings" };
  if (s.interviewStatus !== "completed") return { kind: "continueInterview", path: "/interview" };
  // Work that is already waiting on a person comes before anything new.
  const attention = s.attention ?? NO_ATTENTION;
  if (attention.pendingProposals > 0) return { kind: "reviewProposal", path: "/approvals" };
  if (attention.failedRuns > 0) return { kind: "inspectAgentFailure", path: "/agents#runs" };
  if (s.tasks.blocked > 0) return { kind: "resolveBlocker", path: "/tasks?status=blocked" };
  if (s.conflictingRequirements > 0)
    return { kind: "resolveConflicts", path: "/requirements#open_questions" };
  if (s.unknownRequirements > 0)
    return { kind: "resolveOpenQuestions", path: "/requirements#open_questions" };
  if (s.prdStatus !== "approved") return { kind: "reviewPrd", path: "/prd" };
  const total = totalTasks(s.tasks);
  if (total === 0) return { kind: "reviewPlan", path: "/plan" };
  if (s.tasks.in_progress + s.tasks.review + s.tasks.done === 0) {
    return { kind: "startFirstTask", path: "/tasks" };
  }
  if (s.tasks.review > 0) return { kind: "reviewWork", path: "/tasks?status=review" };
  return { kind: "continueBuilding", path: "/tasks" };
}
