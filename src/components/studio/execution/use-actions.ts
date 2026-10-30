"use client";

import { useState, useTransition } from "react";
import {
  buildFromPlanAction,
  cancelExecutionAction,
  retryTaskAction,
  revisePlanAction,
} from "@/app/[locale]/(app)/project/[slug]/studio/actions";
import type { ActionResult } from "@/lib/errors";

/** The buttons of an execution. Each one asks the server and then reads the real state again. */
export function useExecutionActions(
  slug: string,
  executionId: string,
  refetch: () => Promise<void>,
) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) setError(result.code);
      else after?.();
      await refetch();
    });

  return {
    pending,
    error,
    clearError: () => setError(null),
    cancel: (after?: () => void) => run(() => cancelExecutionAction(slug, executionId), after),
    retry: (taskId: string) => run(() => retryTaskAction(slug, executionId, taskId)),
    build: () => run(() => buildFromPlanAction(slug, executionId)),
    revise: (request: string, after?: () => void) =>
      run(() => revisePlanAction(slug, executionId, { request }), after),
  };
}
