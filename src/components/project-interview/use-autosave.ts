"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveAnswersAction } from "@/app/[locale]/(app)/project/[slug]/interview/actions";
import type { SaveState } from "@/components/app/save-indicator";
import {
  ANSWER_KEYS,
  type InterviewData,
  type InterviewStep,
  type QuestionKey,
} from "@/lib/interviews/model";

const DEBOUNCE_MS = 600;

const isAnswerKey = (key: QuestionKey): key is (typeof ANSWER_KEYS)[number] =>
  (ANSWER_KEYS as readonly string[]).includes(key);

/** Value to persist for a key; an unset answer is sent as null so the server clears it. */
function valueOf(data: InterviewData, key: QuestionKey): unknown {
  const value = isAnswerKey(key) ? data.answers[key] : data[key];
  return value === undefined ? null : value;
}

/** Keys whose value differs between two snapshots. */
export function changedKeys(prev: InterviewData, next: InterviewData): QuestionKey[] {
  const keys: QuestionKey[] = [];
  for (const key of ANSWER_KEYS) {
    if (JSON.stringify(prev.answers[key]) !== JSON.stringify(next.answers[key])) keys.push(key);
  }
  for (const key of ["details", "overrides", "resolutions", "keptUnresolved"] as const) {
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) keys.push(key);
  }
  return keys;
}

/**
 * Progressive persistence: changes are batched for 600 ms, saves run one at a time, and a
 * failed save keeps its keys dirty so the next change retries them. Nothing is lost on
 * refresh except the last fraction of a second, and the user is warned before leaving.
 */
export function useAutosave(slug: string, initialStep: InterviewStep) {
  const [state, setState] = useState<SaveState>("idle");
  const dirty = useRef(new Set<QuestionKey>());
  const confirmed = useRef(new Set<QuestionKey>());
  const data = useRef<InterviewData | null>(null);
  const step = useRef<InterviewStep>(initialStep);
  const stepDirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback((): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    queue.current = queue.current.then(async () => {
      const current = data.current;
      if (
        !current ||
        (dirty.current.size === 0 && confirmed.current.size === 0 && !stepDirty.current)
      )
        return;
      const keys = [...dirty.current];
      const confirm = [...confirmed.current];
      dirty.current.clear();
      confirmed.current.clear();
      stepDirty.current = false;
      setState("saving");
      try {
        const result = await saveAnswersAction({
          slug,
          step: step.current,
          confirm,
          patch: Object.fromEntries(keys.map((k) => [k, valueOf(current, k)])),
        });
        if (!result.ok) throw new Error(result.code);
        setState(dirty.current.size > 0 ? "dirty" : "saved");
      } catch {
        for (const k of keys) dirty.current.add(k);
        for (const k of confirm) confirmed.current.add(k);
        setState("error");
      }
    });
    return queue.current;
  }, [slug]);

  const schedule = useCallback(() => {
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }, [flush]);

  /** Records a new snapshot and which keys changed. */
  const track = useCallback(
    (next: InterviewData, keys: QuestionKey[]) => {
      data.current = next;
      if (keys.length === 0) return;
      for (const k of keys) dirty.current.add(k);
      schedule();
    },
    [schedule],
  );

  const confirm = useCallback(
    (next: InterviewData, key: QuestionKey) => {
      data.current = next;
      confirmed.current.add(key);
      schedule();
    },
    [schedule],
  );

  /** Moving between steps saves immediately so "resume" returns to the right place. */
  const moveTo = useCallback(
    (next: InterviewData, target: InterviewStep) => {
      data.current = next;
      step.current = target;
      stepDirty.current = true;
      void flush();
    },
    [flush],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current.size > 0 || timer.current) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [flush]);

  return { state, track, confirm, moveTo, flush };
}
