"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { updateTaskAction } from "@/app/[locale]/(app)/project/[slug]/tasks/actions";
import { EmptyState, PageHeading } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { TASK_STATUSES, type TaskStatus } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";
import { StatusFilter } from "./status-filter";
import { TaskCard } from "./task-card";
import { TaskDialog } from "./task-dialog";
import type { MilestoneOption, TaskDraft, TaskItem, TaskRun } from "./types";

type Move = { id: string; status: TaskStatus };

const parseStatus = (value: string | null): TaskStatus | null =>
  TASK_STATUSES.find((s) => s === value) ?? null;

const applyMove = (state: TaskItem[], move: Move) =>
  state.map((task) => (task.id === move.id ? { ...task, status: move.status } : task));

const toDraft = (task: TaskItem): TaskDraft => ({
  id: task.id,
  title: task.title,
  description: task.description,
  priority: task.priority,
  status: task.status,
  milestoneId: task.milestoneId,
});

/** Rewrites the query string in place; Next re-renders useSearchParams consumers. */
function setParam(name: string, value: string | null) {
  const url = new URL(window.location.href);
  if (url.searchParams.get(name) === value) return;
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(null, "", url);
}

/**
 * Columns per status on desktop, a grouped list below lg. Status changes apply immediately
 * through useOptimistic; when the action fails the transition ends, the optimistic value is
 * dropped (rollback) and the failure is announced.
 */
export function TaskBoard({
  slug,
  tasks,
  milestones,
  runs,
  canEdit,
}: {
  slug: string;
  tasks: TaskItem[];
  milestones: MilestoneOption[];
  /** Open agent runs keyed by task id. */
  runs: Record<string, TaskRun>;
  canEdit: boolean;
}) {
  const t = useTranslations("tasks");
  const [optimistic, addMove] = useOptimistic(tasks, applyMove);
  const [, startTransition] = useTransition();
  // The URL is the source of truth so next-action links like ?status=blocked just work.
  const params = useSearchParams();
  const filter = parseStatus(params.get("status"));
  // ?task=<id> opens that task, e.g. from a link Saqina posted after creating it.
  const linkedId = params.get("task");
  const openedLink = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [movedId, setMovedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);

  const milestoneTitles = useMemo(
    () => new Map(milestones.map((m) => [m.id, m.title])),
    [milestones],
  );
  const byStatus = useMemo(() => {
    const groups = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as TaskItem[]])) as Record<
      TaskStatus,
      TaskItem[]
    >;
    for (const task of optimistic) groups[task.status].push(task);
    return groups;
  }, [optimistic]);
  const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, byStatus[s].length])) as Record<
    TaskStatus,
    number
  >;

  useEffect(() => {
    if (!linkedId || openedLink.current === linkedId) return;
    const task = tasks.find((item) => item.id === linkedId);
    if (!task) return;
    openedLink.current = linkedId;
    setDraft(toDraft(task));
  }, [linkedId, tasks]);

  // Next syncs useSearchParams with native history updates, so this re-renders the board.
  const changeFilter = (next: TaskStatus | null) => setParam("status", next);

  function closeDialog() {
    setDraft(null);
    openedLink.current = null;
    setParam("task", null);
  }

  function move(task: TaskItem, status: TaskStatus) {
    if (task.status === status) return;
    setFailed(false);
    setMovedId(task.id);
    startTransition(async () => {
      addMove({ id: task.id, status });
      const result = await updateTaskAction(slug, { id: task.id, status });
      if (!result.ok) setFailed(true);
    });
  }

  const openCreate = () =>
    setDraft({
      title: "",
      description: "",
      priority: "medium",
      status: filter ?? "todo",
      milestoneId: null,
    });
  const openEdit = (task: TaskItem) => setDraft(toDraft(task));

  const addButton = canEdit ? <Button onClick={openCreate}>{t("add")}</Button> : null;
  const visible = filter ? [filter] : TASK_STATUSES;

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} actions={addButton} />

      <div aria-live="polite">
        {failed ? (
          <Notice tone="error" className="mb-6">
            {t("failed")}
          </Notice>
        ) : null}
      </div>

      {optimistic.length === 0 ? (
        <EmptyState title={t("title")} body={t("empty")} action={addButton} />
      ) : (
        <>
          <StatusFilter value={filter} counts={counts} onChange={changeFilter} />
          <div className="flex flex-col gap-8 lg:flex-row lg:gap-4 lg:overflow-x-auto lg:pb-3">
            {visible.map((status) => {
              const items = byStatus[status];
              return (
                <section
                  key={status}
                  aria-labelledby={`col-${status}`}
                  className={cn(
                    "min-w-0 lg:shrink-0",
                    filter ? "lg:w-full lg:max-w-xl" : "lg:w-64",
                    // Below lg the list stays short: empty groups are skipped unless filtered.
                    !filter && items.length === 0 && "hidden lg:block",
                  )}
                >
                  <h2
                    id={`col-${status}`}
                    className="mb-3 flex items-baseline justify-between gap-2 border-b border-border pb-2 text-sm font-medium"
                  >
                    {t(`statuses.${status}`)}
                    <span className="font-mono text-xs text-subtle-foreground">{items.length}</span>
                  </h2>
                  {items.length === 0 ? (
                    <p className="text-sm text-subtle-foreground">{t("columnEmpty")}</p>
                  ) : (
                    <ul className="space-y-3">
                      {items.map((task) => (
                        <li key={task.id}>
                          <TaskCard
                            task={task}
                            milestoneTitle={
                              task.milestoneId
                                ? (milestoneTitles.get(task.milestoneId) ?? null)
                                : null
                            }
                            slug={slug}
                            run={runs[task.id] ?? null}
                            canEdit={canEdit}
                            moved={movedId === task.id}
                            onMove={move}
                            onEdit={openEdit}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {draft ? (
        <TaskDialog
          slug={slug}
          initial={draft}
          milestones={milestones}
          canEdit={canEdit}
          run={draft.id ? (runs[draft.id] ?? null) : null}
          onClose={closeDialog}
        />
      ) : null}
    </>
  );
}
