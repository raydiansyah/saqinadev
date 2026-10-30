"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import type { ExecutionDTO } from "@/lib/executions/dto";
import { ExecutionStatusBadge } from "./status";
import type { Connection } from "./store";
import type { useExecutionActions } from "./use-actions";

const OPEN = ["queued", "planning", "planned", "running", "waiting_approval", "cancelling"];

/** Ticks once a second while the execution is open. Elapsed time is worked out from stored timestamps. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** "plan_invalid:cycle" is the reason and what was wrong with it; unknown reasons are shown as they are. */
function whyFailed(t: ReturnType<typeof useTranslations>, summary: string): string {
  const cut = summary.indexOf(":");
  const code = cut < 0 ? summary : summary.slice(0, cut);
  const raw = cut < 0 ? "" : summary.slice(cut + 1);
  // "plan_invalid:cycle,unknown_role": each problem in the person's language.
  const detail =
    code === "plan_invalid"
      ? raw
          .split(",")
          .map((p) => (t.has(`planProblems.${p}` as never) ? t(`planProblems.${p}` as never) : p))
          .join("; ")
      : raw;
  return t.has(`reasons.${code}` as never)
    ? t(`reasons.${code}` as never, { role: "", detail } as never)
    : summary;
}

export const formatElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
};

/**
 * Status, time, progress and the controls of one execution. Progress is tasks that really finished
 * out of the tasks of the plan; before there are tasks it says so instead of guessing.
 */
export function ExecutionToolbar({
  execution,
  connection,
  canWrite,
  actions,
}: {
  execution: ExecutionDTO;
  connection: Connection;
  canWrite: boolean;
  actions: ReturnType<typeof useExecutionActions>;
}) {
  const t = useTranslations("studio.execution");
  const app = useTranslations("app.errors");
  const open = OPEN.includes(execution.status);
  const now = useNow(open);
  const [confirming, setConfirming] = useState(false);
  // Time counts from the request, so planning is part of it. A plan waiting to be built has no clock.
  const started = new Date(execution.startedAt ?? execution.createdAt).getTime();
  const waiting = execution.status === "planned";
  const ended = execution.endedAt ? new Date(execution.endedAt).getTime() : now;
  const { done, total } = execution.progress;

  const status = useTranslations("studio.execution.status");
  return (
    <div className="space-y-3">
      {/* Said once when the state changes, not on every event. */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {t(`mode.${execution.mode}`)}: {status(execution.status)}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ExecutionStatusBadge status={execution.status} />
        <span className="text-xs text-muted-foreground">{t(`mode.${execution.mode}`)}</span>
        {waiting ? null : (
          <span className="font-mono text-xs text-subtle-foreground">
            {t(open ? "elapsed" : "took", { time: formatElapsed(ended - started) })}
          </span>
        )}
        {open && connection !== "live" && connection !== "idle" ? (
          <span role="status" className="text-xs text-warning">
            {connection === "polling" ? t("connection.polling") : t("connection.reconnecting")}
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          {canWrite && execution.status === "planned" ? (
            <Button size="sm" disabled={actions.pending} onClick={actions.build}>
              {t("buildPlan")}
            </Button>
          ) : null}
          {canWrite && open && execution.status !== "cancelling" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={actions.pending}
              onClick={() => setConfirming(true)}
            >
              {t(execution.status === "planned" ? "discard" : "cancel")}
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total > 0 ? t("progress", { done, total }) : t("progressNone")}</span>
        </div>
        <div
          role="progressbar"
          aria-label={t("progressLabel")}
          aria-valuemin={0}
          aria-valuemax={Math.max(total, 1)}
          aria-valuenow={done}
          className="mt-1 h-1.5 overflow-hidden rounded bg-surface"
        >
          <div
            className="h-full rounded bg-success transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: total > 0 ? `${Math.round((done / total) * 100)}%` : "0%" }}
          />
        </div>
      </div>

      {execution.status === "cancelling" ? (
        <Notice tone="info">{t("cancellingNote")}</Notice>
      ) : null}
      {execution.status === "failed" && execution.errorSummary ? (
        <Notice tone="error">{whyFailed(t, execution.errorSummary)}</Notice>
      ) : null}
      {actions.error ? (
        <Notice tone="error">
          {app.has(actions.error as never) ? app(actions.error as never) : app("INTERNAL_ERROR")}
        </Notice>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title={t(execution.status === "planned" ? "discardTitle" : "cancelTitle")}
        body={t(execution.status === "planned" ? "discardBody" : "cancelBody")}
        confirmLabel={t(execution.status === "planned" ? "discardConfirm" : "cancelConfirm")}
        pending={actions.pending}
        onClose={() => setConfirming(false)}
        onConfirm={() => actions.cancel(() => setConfirming(false))}
      />
    </div>
  );
}
