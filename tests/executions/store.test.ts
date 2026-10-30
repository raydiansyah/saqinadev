import { describe, expect, it } from "vitest";
import { INITIAL, MAX_EVENTS, reduce } from "@/components/studio/execution/store";
import type { EventDTO, ExecutionDTO } from "@/lib/executions/dto";

const event = (seq: number, type = "task.progress"): EventDTO => ({
  seq,
  type,
  payload: {},
  createdAt: "2026-10-30T00:00:00.000Z",
});
const execution = (seq: number, status: ExecutionDTO["status"] = "running"): ExecutionDTO => ({
  id: "e1",
  mode: "build",
  request: "Build",
  status,
  planVersion: 1,
  branch: null,
  goal: null,
  risks: [],
  errorSummary: null,
  cancelRequested: false,
  startedAt: null,
  endedAt: null,
  createdAt: "2026-10-30T00:00:00.000Z",
  seq,
  budget: { maxTasks: 25, maxDepth: 6, maxRetries: 2, maxParallel: 3, maxMinutes: 60 },
  tasks: [],
  agents: [],
  messages: [],
  artifacts: [],
  progress: { done: 0, total: 0 },
});
const snap = (
  seq: number,
  status: ExecutionDTO["status"] = "running",
  events: EventDTO[] = [],
) => ({
  type: "snapshot" as const,
  snapshot: { execution: execution(seq, status), events },
});

describe("execution store", () => {
  it("takes a snapshot as the truth and remembers the highest event number", () => {
    const s = reduce(INITIAL, snap(5, "running", [event(4), event(5)]));
    expect(s.execution?.seq).toBe(5);
    expect(s.lastSeq).toBe(5);
    expect(s.stale).toBe(false);
  });

  it("ignores an event it already has, so a replay adds nothing", () => {
    let s = reduce(INITIAL, snap(3, "running", [event(1), event(2), event(3)]));
    s = reduce(s, { type: "events", events: [event(2), event(3)] });
    expect(s.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    const again = reduce(s, { type: "events", events: [event(3)] });
    expect(again).toBe(s);
  });

  it("marks itself stale when the stream is ahead of the snapshot, then clears it on a newer snapshot", () => {
    let s = reduce(INITIAL, snap(3));
    s = reduce(s, { type: "events", events: [event(4)] });
    expect(s.stale).toBe(true);
    s = reduce(s, snap(4));
    expect(s.stale).toBe(false);
  });

  it("flags a skipped event number as a gap that needs a fresh snapshot", () => {
    let s = reduce(INITIAL, snap(3, "running", [event(3)]));
    s = reduce(s, { type: "events", events: [event(7)] });
    expect(s.stale).toBe(true);
    expect(s.lastSeq).toBe(7);
  });

  it("sorts events that arrive out of order", () => {
    let s = reduce(INITIAL, snap(1, "running", [event(1)]));
    s = reduce(s, { type: "events", events: [event(4), event(2), event(3)] });
    expect(s.events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it("never lets an older snapshot replace a newer one", () => {
    let s = reduce(INITIAL, snap(9, "succeeded"));
    s = reduce(s, snap(6, "running"));
    expect(s.execution?.status).toBe("succeeded");
    expect(s.execution?.seq).toBe(9);
  });

  it("does not move a finished execution back to running because a late event arrived", () => {
    let s = reduce(INITIAL, snap(9, "succeeded"));
    s = reduce(s, { type: "events", events: [event(6, "task.started")] });
    expect(s.execution?.status).toBe("succeeded");
    expect(s.events).toEqual([]);
  });

  it("keeps only the latest events", () => {
    const many = Array.from({ length: MAX_EVENTS + 50 }, (_, i) => event(i + 1));
    const s = reduce(INITIAL, snap(MAX_EVENTS + 50, "running", many));
    expect(s.events).toHaveLength(MAX_EVENTS);
    expect(s.events[0].seq).toBe(51);
  });

  it("tracks the connection without touching the data", () => {
    const s = reduce(reduce(INITIAL, snap(2)), { type: "connection", connection: "reconnecting" });
    expect(s.connection).toBe("reconnecting");
    expect(s.execution?.seq).toBe(2);
    expect(reduce(s, { type: "reset" })).toEqual(INITIAL);
  });
});
