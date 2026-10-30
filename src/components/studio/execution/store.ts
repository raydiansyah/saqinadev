import type { EventDTO, ExecutionDTO, ExecutionSnapshotDTO } from "@/lib/executions/dto";

/**
 * What the browser knows about one execution. It is a copy of what the server said, never a
 * second opinion: the snapshot decides every status, the events only tell us when to ask again.
 */
export type Connection = "idle" | "connecting" | "live" | "reconnecting" | "polling";

export interface ExecutionState {
  execution: ExecutionDTO | null;
  /** The most recent events seen, oldest first, one per number. */
  events: EventDTO[];
  /** Highest event number seen, from a snapshot or from the stream. */
  lastSeq: number;
  /** True when the stream is ahead of the snapshot, or an event number was skipped. */
  stale: boolean;
  connection: Connection;
}

export type ExecutionAction =
  | { type: "snapshot"; snapshot: ExecutionSnapshotDTO }
  | { type: "events"; events: EventDTO[] }
  | { type: "connection"; connection: Connection }
  | { type: "reset" };

export const MAX_EVENTS = 300;
export const INITIAL: ExecutionState = {
  execution: null,
  events: [],
  lastSeq: 0,
  stale: false,
  connection: "idle",
};

const merge = (current: EventDTO[], incoming: EventDTO[]): EventDTO[] => {
  const bySeq = new Map(current.map((e) => [e.seq, e]));
  for (const e of incoming) if (!bySeq.has(e.seq)) bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-MAX_EVENTS);
};

export function reduce(state: ExecutionState, action: ExecutionAction): ExecutionState {
  switch (action.type) {
    case "reset":
      return INITIAL;
    case "connection":
      return state.connection === action.connection
        ? state
        : { ...state, connection: action.connection };
    case "snapshot": {
      const next = action.snapshot.execution;
      // A response that left before a newer one: drop it, so an old copy never replaces a newer one.
      if (state.execution && next.seq < state.execution.seq) return state;
      const events = merge(state.events, action.snapshot.events);
      const lastSeq = Math.max(state.lastSeq, next.seq, events.at(-1)?.seq ?? 0);
      return { ...state, execution: next, events, lastSeq, stale: lastSeq > next.seq };
    }
    case "events": {
      const fresh = action.events
        .filter((e) => e.seq > state.lastSeq)
        .sort((a, b) => a.seq - b.seq);
      if (fresh.length === 0) return state;
      // A skipped number means something was missed: the snapshot is the way to catch up.
      const gap = state.lastSeq > 0 && fresh[0].seq > state.lastSeq + 1;
      const lastSeq = fresh[fresh.length - 1].seq;
      const known = state.execution?.seq ?? 0;
      return {
        ...state,
        events: merge(state.events, fresh),
        lastSeq,
        stale: gap || lastSeq > known,
      };
    }
  }
}

export const isFinal = (e: ExecutionDTO | null) =>
  e !== null && (e.status === "succeeded" || e.status === "failed" || e.status === "cancelled");
