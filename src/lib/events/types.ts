/**
 * Generic project events. The orchestration layer emits these; anything that wants to react
 * (activity feed today; notifications, monitoring or a visual layer later) subscribes. Event
 * names describe what happened in the domain, never how it should be drawn.
 */
export const PROJECT_EVENT_TYPES = [
  "TASK_CREATED",
  "TASK_UPDATED",
  "TASK_COMPLETED",
  "TASK_DELETED",
  "REQUIREMENT_CREATED",
  "REQUIREMENT_UPDATED",
  "REQUIREMENT_DELETED",
  "DOCUMENT_UPDATED",
  "MEMORY_CREATED",
  "DECISION_CREATED",
  "PROPOSAL_CREATED",
  "PROPOSAL_APPROVED",
  "PROPOSAL_REJECTED",
  "PROPOSAL_REVISION_REQUESTED",
  "PROPOSAL_CANCELLED",
  "AGENT_ASSIGNED",
  "AGENT_STARTED",
  "AGENT_THINKING",
  "AGENT_WAITING",
  "AGENT_BLOCKED",
  "AGENT_PAUSED",
  "AGENT_COMPLETED",
  "AGENT_FAILED",
  "AGENT_CANCELLED",
] as const;
export type ProjectEventType = (typeof PROJECT_EVENT_TYPES)[number];

export type EventData = Record<string, string | number | boolean | null>;

export interface ProjectEvent {
  type: ProjectEventType;
  projectId: string;
  actorId: string | null;
  entityType: string;
  entityId: string | null;
  data: EventData;
  at: Date;
}

/** Who caused a change and through which channel. Written into activity metadata. */
export interface Trace {
  via: "user" | "assistant" | "agent";
  conversationId?: string | null;
  proposalId?: string | null;
  runId?: string | null;
}

export const USER_TRACE: Trace = { via: "user" };

/** Flattens a trace into activity metadata, omitting empty links. */
export function traceMetadata(trace: Trace): EventData {
  const out: EventData = {};
  if (trace.via !== "user") out.via = trace.via;
  if (trace.conversationId) out.conversationId = trace.conversationId;
  if (trace.proposalId) out.proposalId = trace.proposalId;
  if (trace.runId) out.runId = trace.runId;
  return out;
}
