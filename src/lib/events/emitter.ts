import "server-only";
import { recordActivity } from "@/lib/activity/service";
import type { Executor } from "@/lib/db/client";
import type { ActivityType } from "@/lib/domain/enums";
import { log } from "@/lib/log";
import type { ProjectEvent, ProjectEventType } from "./types";

/** Events that also belong in the human-readable activity feed. THINKING etc. stay in run logs. */
const ACTIVITY_FOR: Partial<Record<ProjectEventType, ActivityType>> = {
  PROPOSAL_CREATED: "proposal.created",
  PROPOSAL_APPROVED: "proposal.approved",
  PROPOSAL_REJECTED: "proposal.rejected",
  PROPOSAL_REVISION_REQUESTED: "proposal.revision_requested",
  PROPOSAL_CANCELLED: "proposal.cancelled",
  AGENT_ASSIGNED: "agent.assigned",
  AGENT_STARTED: "agent.started",
  AGENT_WAITING: "agent.waiting",
  AGENT_COMPLETED: "agent.completed",
  AGENT_FAILED: "agent.failed",
  AGENT_CANCELLED: "agent.cancelled",
};

type Listener = (event: ProjectEvent) => void;
const listeners = new Set<Listener>();

/** In-process subscription. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Collects events raised inside a transaction so subscribers only hear about changes that
 * were actually committed. Call `flush()` after the transaction resolves.
 */
export class EventBatch {
  private readonly events: ProjectEvent[] = [];

  async emit(tx: Executor, event: Omit<ProjectEvent, "at">): Promise<void> {
    const full = { ...event, at: new Date() };
    const activity = ACTIVITY_FOR[event.type];
    if (activity) {
      await recordActivity(tx, {
        projectId: event.projectId,
        actorId: event.actorId,
        type: activity,
        entityType: event.entityType,
        entityId: event.entityId,
        metadata: event.data,
      });
    }
    this.events.push(full);
  }

  flush(): void {
    for (const event of this.events.splice(0)) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          log.error("event.listener_failed", { type: event.type, error: String(error) });
        }
      }
    }
  }
}
