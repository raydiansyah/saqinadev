import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { StatusChip } from "@/components/tasks/task-badges";
import type { TaskStatus } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";

export interface PlanTask {
  id: string;
  title: string;
  status: TaskStatus;
}

/**
 * One milestone (or the trailing "no milestone" group). Progress is the literal done/total
 * count; the bar mirrors that ratio and is hidden from assistive tech since the text says it.
 */
export function MilestoneBlock({
  headingId,
  eyebrow,
  title,
  goal,
  tasks,
  actions,
}: {
  headingId: string;
  eyebrow?: string;
  title: string;
  goal?: string;
  tasks: PlanTask[];
  actions?: ReactNode;
}) {
  const t = useTranslations("plan");
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;

  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <p className="font-mono text-xs text-subtle-foreground">{eyebrow}</p> : null}
          <h2 id={headingId} className="mt-1 text-lg font-semibold text-pretty">
            {title}
          </h2>
          {goal ? <p className="mt-1 text-sm text-pretty text-muted-foreground">{goal}</p> : null}
        </div>
        {actions ? <div className="-mt-1 shrink-0">{actions}</div> : null}
      </div>

      {total > 0 ? (
        <div className="mt-4">
          <p className="font-mono text-xs text-muted-foreground">{t("tasks", { done, total })}</p>
          <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-md bg-surface-raised">
            <div className="h-full bg-success" style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <ul className="mt-4 divide-y divide-border border-t border-border">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 py-2.5">
                <span
                  className={cn(
                    "min-w-0 text-sm text-pretty",
                    task.status === "done" && "text-muted-foreground",
                  )}
                >
                  {task.title}
                </span>
                <StatusChip status={task.status} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-sm text-subtle-foreground">{t("noTasks")}</p>
      )}
    </section>
  );
}
