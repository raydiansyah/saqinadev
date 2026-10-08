"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { RunStatusChip } from "@/components/assistant/blocks/run-card";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { TASK_STATUSES, type TaskStatus } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "./task-badges";
import type { TaskItem, TaskRun } from "./types";

/** One task with keyboard-friendly controls: a status select instead of drag and drop. */
export function TaskCard({
  task,
  milestoneTitle,
  slug,
  run,
  canEdit,
  moved,
  onMove,
  onEdit,
}: {
  task: TaskItem;
  milestoneTitle: string | null;
  slug: string;
  /** Open agent run on this task, if any. */
  run: TaskRun | null;
  canEdit: boolean;
  /** True right after this card changed status; plays the entry motion once. */
  moved: boolean;
  onMove: (task: TaskItem, status: TaskStatus) => void;
  onEdit: (task: TaskItem) => void;
}) {
  const t = useTranslations("tasks");
  const states = useTranslations("app.states");
  const id = useId();
  const done = task.status === "done";

  return (
    <article
      aria-labelledby={`${id}-title`}
      className={cn(
        "rounded-lg border border-border bg-surface p-3 transition-colors",
        moved && "panel-in",
      )}
    >
      <h3
        id={`${id}-title`}
        className={cn("text-sm font-medium text-pretty", done && "text-muted-foreground")}
      >
        {task.title}
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <PriorityBadge priority={task.priority} />
        <span>{t(`source.${task.source}`)}</span>
        {milestoneTitle ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="min-w-0 truncate">{milestoneTitle}</span>
          </>
        ) : null}
      </div>
      {run ? (
        <Link
          href={`/project/${slug}/agents/runs/${run.runId}`}
          className="mt-2 flex min-h-9 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden="true" className="text-info">
            ●
          </span>
          <span className="min-w-0 truncate">{run.agentName}</span>
          <RunStatusChip status={run.status} />
        </Link>
      ) : null}

      {canEdit ? (
        <div className="mt-3 space-y-2">
          <label htmlFor={`${id}-move`} className="sr-only">
            {t("move", { title: task.title })}
          </label>
          <select
            id={`${id}-move`}
            value={task.status}
            onChange={(e) => onMove(task, e.target.value as TaskStatus)}
            className={cn(FIELD_CLASS, "min-h-11 py-2 text-sm sm:min-h-9")}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => onMove(task, done ? "todo" : "done")}
            >
              {done ? t("reopen") : t("complete")}
              <span className="sr-only">: {task.title}</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onEdit(task)}>
              {states("edit")}
              <span className="sr-only">: {task.title}</span>
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
