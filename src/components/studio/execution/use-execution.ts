"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { EventDTO, ExecutionSnapshotDTO } from "@/lib/executions/dto";
import { INITIAL, isFinal, reduce } from "./store";

const POLL_MS = 4000;
/** After this many failures in a row the stream is given up and the snapshot is polled instead. */
const MAX_STREAM_ERRORS = 3;
const REFETCH_DEBOUNCE_MS = 150;

export interface UseExecution {
  state: ReturnType<typeof reduce>;
  /** `null` while the first snapshot loads, `"gone"` when the execution cannot be shown to this person. */
  error: "gone" | "failed" | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Keeps one execution in step with the server: a snapshot first, then a stream of events that says
 * when to ask again. A dropped connection resumes from the last event number; a missed number,
 * a returning tab or a stream that keeps failing all fall back to the snapshot, which is the truth.
 */
export function useExecution(slug: string, id: string | null, live: boolean): UseExecution {
  const [state, dispatch] = useReducer(reduce, INITIAL);
  const [error, setError] = useReducer(
    (_: UseExecution["error"], next: UseExecution["error"]) => next,
    null,
  );
  const loaded = useRef(false);
  const inflight = useRef<Promise<void> | null>(null);
  const lastSeq = useRef(0);
  lastSeq.current = state.lastSeq;
  const finished = isFinal(state.execution);

  const refetch = useCallback(async () => {
    if (!id) return;
    // One request at a time: a burst of events asks once.
    if (inflight.current) return inflight.current;
    const run = (async () => {
      try {
        const res = await fetch(`/api/projects/${slug}/executions/${id}`, { cache: "no-store" });
        if (res.status === 404 || res.status === 403 || res.status === 401) return setError("gone");
        if (!res.ok) return setError(loaded.current ? null : "failed");
        const body = (await res.json()) as { ok: boolean; data: ExecutionSnapshotDTO };
        if (!body.ok) return setError("failed");
        loaded.current = true;
        setError(null);
        dispatch({ type: "snapshot", snapshot: body.data });
      } catch {
        // Offline for a moment: keep what we have. The stream or the poll asks again.
        if (!loaded.current) setError("failed");
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = run;
    return run;
  }, [slug, id]);

  // First load, and a clean slate when another execution is shown.
  useEffect(() => {
    loaded.current = false;
    dispatch({ type: "reset" });
    setError(null);
    if (id) void refetch();
  }, [id, refetch]);

  // The stream: only for the execution being watched, and not once it is finished.
  const watching = live && id !== null && state.execution !== null && !finished;
  useEffect(() => {
    if (!watching || !id || typeof EventSource === "undefined") {
      if (watching) dispatch({ type: "connection", connection: "polling" });
      return;
    }
    let errors = 0;
    dispatch({ type: "connection", connection: "connecting" });
    const source = new EventSource(
      `/api/projects/${slug}/executions/${id}/events?after=${lastSeq.current}`,
    );
    source.addEventListener("open", () => {
      errors = 0;
      dispatch({ type: "connection", connection: "live" });
    });
    source.addEventListener("execution", (message) => {
      errors = 0;
      try {
        dispatch({
          type: "events",
          events: [JSON.parse((message as MessageEvent).data) as EventDTO],
        });
      } catch {
        void refetch();
      }
    });
    source.addEventListener("end", () => {
      source.close();
      dispatch({ type: "connection", connection: "idle" });
      void refetch();
    });
    source.addEventListener("error", () => {
      errors += 1;
      if (errors >= MAX_STREAM_ERRORS) {
        source.close();
        dispatch({ type: "connection", connection: "polling" });
        return;
      }
      dispatch({ type: "connection", connection: "reconnecting" });
    });
    return () => {
      source.close();
      dispatch({ type: "connection", connection: "idle" });
    };
  }, [watching, slug, id, refetch]);

  // The stream is ahead of the snapshot (or skipped a number): ask for the real state. A newer
  // event while a request is out keeps the copy stale, so the event number re-arms the request.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lastSeq re-arms the refetch
  useEffect(() => {
    if (!state.stale) return;
    const timer = setTimeout(() => void refetch(), REFETCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state.stale, state.lastSeq, refetch]);

  // Polling stands in for a stream that cannot connect.
  const polling = state.connection === "polling" && watching;
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refetch();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [polling, refetch]);

  // Coming back to the tab: whatever happened meanwhile is in the snapshot.
  useEffect(() => {
    if (!live || !id) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [live, id, refetch]);

  return {
    state,
    error,
    loading: id !== null && state.execution === null && error === null,
    refetch,
  };
}
