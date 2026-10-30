/** Vocabularies of the multi-agent execution engine. Plain strings in the database, never enums. */

export const EXECUTION_MODES = ["plan", "build"] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const EXECUTION_STATUSES = [
  "queued",
  "planning",
  "planned",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "cancelling",
  "cancelled",
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/** Task state inside an execution. The Kanban `tasks.status` stays a person's view of the same work. */
export const EXECUTION_TASK_STATUSES = [
  "pending",
  "queued",
  "running",
  "waiting_agent",
  "waiting_approval",
  "blocked",
  "reviewing",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type ExecutionTaskStatus = (typeof EXECUTION_TASK_STATUSES)[number];

/** What an agent shows in the Studio. Derived from its current task, never stored or timed. */
export const AGENT_LIVE_STATUSES = [
  "idle",
  "queued",
  "planning",
  "running",
  "waiting_agent",
  "waiting_approval",
  "blocked",
  "reviewing",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type AgentLiveStatus = (typeof AGENT_LIVE_STATUSES)[number];

export const AGENT_DEFINITION_STATUSES = ["active", "inactive", "archived"] as const;
export type AgentDefinitionStatus = (typeof AGENT_DEFINITION_STATUSES)[number];

export const AGENT_MESSAGE_TYPES = [
  "assignment",
  "handoff",
  "info_request",
  "decision",
  "dependency_ready",
  "blocker",
  "review_request",
  "review_feedback",
  "test_result",
  "conflict",
  "completion",
  "failure",
] as const;
export type AgentMessageType = (typeof AGENT_MESSAGE_TYPES)[number];

export const AGENT_MESSAGE_STATUSES = ["sent", "delivered", "handled"] as const;
export type AgentMessageStatus = (typeof AGENT_MESSAGE_STATUSES)[number];

export const EXECUTION_ARTIFACT_KINDS = [
  "file_change",
  "commit",
  "test_result",
  "decision",
  "report",
] as const;
export type ExecutionArtifactKind = (typeof EXECUTION_ARTIFACT_KINDS)[number];

export const EXECUTION_JOB_KINDS = ["plan", "dispatch", "run_task"] as const;
export type ExecutionJobKind = (typeof EXECUTION_JOB_KINDS)[number];

export const EXECUTION_JOB_STATUSES = ["pending", "running", "done", "failed"] as const;
export type ExecutionJobStatus = (typeof EXECUTION_JOB_STATUSES)[number];

/** Every event type an execution can emit. The persisted log and the SSE stream use these names. */
export const EXECUTION_EVENT_TYPES = [
  "execution.created",
  "execution.started",
  "execution.updated",
  "execution.completed",
  "execution.failed",
  "execution.cancelled",
  "task.created",
  "task.assigned",
  "task.started",
  "task.progress",
  "task.blocked",
  "task.completed",
  "task.failed",
  "task.cancelled",
  "agent.status_changed",
  "agent.message_created",
  "agent.handoff_created",
  "artifact.created",
  "file.changed",
  "code.diff_updated",
  "git.operation_completed",
  "preview.build_started",
  "preview.updated",
  "preview.failed",
  "approval.required",
  "approval.completed",
] as const;
export type ExecutionEventType = (typeof EXECUTION_EVENT_TYPES)[number];

/** Limits that stop an execution from growing without end. Stored on the execution as its budget. */
export interface ExecutionBudget {
  maxTasks: number;
  /** Longest chain of tasks that depend on each other. */
  maxDepth: number;
  /** Extra attempts per task after the first. */
  maxRetries: number;
  /** Runs started at the same time. */
  maxParallel: number;
  /** Wall-clock limit for the whole execution, in minutes. */
  maxMinutes: number;
}

export const DEFAULT_EXECUTION_BUDGET: ExecutionBudget = {
  maxTasks: 25,
  maxDepth: 6,
  maxRetries: 2,
  maxParallel: 3,
  maxMinutes: 60,
};

/** Role keys a plan task may name; each must map to an active agent definition. */
export const AGENT_DEFINITION_ROLES = [
  "planner",
  "architect",
  "backend",
  "frontend",
  "database",
  "qa",
  "reviewer",
  "devops",
  "docs",
  "custom",
] as const;
export type AgentDefinitionRole = (typeof AGENT_DEFINITION_ROLES)[number];
