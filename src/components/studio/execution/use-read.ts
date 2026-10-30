"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/errors";

export interface Read<T> {
  data: T | null;
  /** The error code of the last try, kept until a try succeeds. The data from before stays on screen. */
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

/**
 * Reads something from the server when `key` changes and `read` is given (nothing is asked until
 * a tab needs it). The answer from before stays on screen while the next one loads, and an answer
 * that arrives after a newer request was made is dropped, so the screen never steps backwards.
 */
export function useRead<T>(read: (() => Promise<ActionResult<T>>) | null, key: string): Read<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const turn = useRef(0);
  const reader = useRef(read);
  reader.current = read;
  const [again, setAgain] = useState(0);
  const enabled = read !== null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: key and again decide when to ask
  useEffect(() => {
    if (!enabled) return;
    const mine = ++turn.current;
    setLoading(true);
    void (async () => {
      try {
        const result = await reader.current?.();
        if (mine !== turn.current || !result) return;
        if (result.ok) {
          setData(result.data);
          setError(null);
        } else setError(result.code);
      } catch {
        if (mine === turn.current) setError("INTERNAL_ERROR");
      } finally {
        if (mine === turn.current) setLoading(false);
      }
    })();
  }, [enabled, key, again]);

  const refetch = useCallback(() => setAgain((n) => n + 1), []);
  return { data, error, loading, refetch };
}
