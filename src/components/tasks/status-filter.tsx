"use client";

import { useTranslations } from "next-intl";
import { TASK_STATUSES, type TaskStatus } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";

const OPTION =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors sm:min-h-9";

/** Toggle group that narrows the board to one status. Counts make empty choices obvious. */
export function StatusFilter({
  value,
  counts,
  onChange,
}: {
  value: TaskStatus | null;
  counts: Record<TaskStatus, number>;
  onChange: (next: TaskStatus | null) => void;
}) {
  const t = useTranslations("tasks");
  const options: (TaskStatus | null)[] = [null, ...TASK_STATUSES];

  return (
    <fieldset className="mb-6">
      <legend className="mb-2 text-sm text-muted-foreground">{t("filter")}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((s) => {
          const active = s === value;
          return (
            <button
              key={s ?? "all"}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(s)}
              className={cn(
                OPTION,
                active
                  ? "border-primary bg-surface-raised text-foreground"
                  : "border-border text-muted-foreground hover:bg-surface-raised hover:text-foreground",
              )}
            >
              {s ? t(`statuses.${s}`) : t("all")}
              {s ? (
                <span className="font-mono text-xs text-subtle-foreground">{counts[s]}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
