"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; fields?: Record<string, string>; ref?: string };

/** Runs a server action, keeps its error, refreshes the page on success. */
export function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ code: string; field?: string } | null>(null);
  const run = <T = any>(fn: () => Promise<Result<unknown>>, after?: (data: T) => void) =>
    start(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) {
        setError({
          code: result.code,
          field: result.fields ? Object.values(result.fields)[0] : undefined,
        });
        return;
      }
      after?.(result.data as T);
      router.refresh();
    });
  return { pending, error, run, clear: () => setError(null) };
}
