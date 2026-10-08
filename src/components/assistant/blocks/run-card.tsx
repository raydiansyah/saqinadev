"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { RunStatus } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";
import type { RunView } from "../types";
import { CARD, CHIP } from "./simple";

export const RUN_TONE: Record<RunStatus, string> = {
  queued: "border-border-strong text-muted-foreground",
  paused: "border-border-strong text-muted-foreground",
  running: "border-info/40 text-info",
  waiting: "border-warning/50 text-warning",
  blocked: "border-error/50 text-error",
  failed: "border-error/50 text-error",
  completed: "border-success/40 text-success",
  cancelled: "border-border text-subtle-foreground",
};

export function RunStatusChip({ status }: { status: RunStatus }) {
  const t = useTranslations("assistant.run.statuses");
  return <span className={cn(CHIP, "font-mono", RUN_TONE[status])}>{t(status)}</span>;
}

/** Compact agent run summary inside a conversation; the run page has the full timeline. */
export function RunCard({ slug, view }: { slug: string; view: RunView }) {
  const t = useTranslations("assistant.run");
  // A run is simulated only when its result says so (model-planned runs are not).
  const simulated =
    (view.run.output as { simulated?: boolean } | null)?.simulated ?? view.agentType === "saqina";
  return (
    <section
      className={cn(CARD, "flex flex-wrap items-center gap-2 px-3 py-2.5")}
      aria-label={t("title")}
    >
      <span aria-hidden="true" className="font-mono text-muted-foreground">
        ●
      </span>
      <span className="text-sm font-medium">{view.agentName}</span>
      {view.taskTitle ? (
        <span className="min-w-0 truncate text-sm text-muted-foreground">{view.taskTitle}</span>
      ) : null}
      <RunStatusChip status={view.run.status} />
      {simulated ? (
        <span className={cn(CHIP, "border-border text-subtle-foreground")}>{t("simulated")}</span>
      ) : null}
      <Link
        href={`/project/${slug}/agents/runs/${view.run.id}`}
        className="ml-auto text-sm text-primary underline-offset-2 hover:underline"
      >
        {t("open")}
      </Link>
    </section>
  );
}
