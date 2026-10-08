import { useTranslations } from "next-intl";
import type { Priority, TaskStatus } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";

// Color only reinforces the text label; meaning never depends on it.
const PRIORITY_TONE: Record<Priority, string> = {
  critical: "border-error/50 text-error",
  high: "border-warning/50 text-warning",
  medium: "border-border-strong text-muted-foreground",
  low: "border-border text-subtle-foreground",
};

const STATUS_TONE: Record<TaskStatus, string> = {
  backlog: "border-border text-subtle-foreground",
  todo: "border-border-strong text-muted-foreground",
  in_progress: "border-info/40 text-info",
  review: "border-warning/50 text-warning",
  done: "border-success/40 text-success",
  blocked: "border-error/50 text-error",
};

const CHIP = "inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs leading-none";

export function PriorityBadge({ priority }: { priority: Priority }) {
  const t = useTranslations("tasks.fields");
  const p = useTranslations("requirements.priorities");
  return (
    <span className={cn(CHIP, PRIORITY_TONE[priority])}>
      <span className="sr-only">{t("priority")}: </span>
      {p(priority)}
    </span>
  );
}

export function StatusChip({ status }: { status: TaskStatus }) {
  const t = useTranslations("tasks");
  return (
    <span className={cn(CHIP, "font-mono transition-colors", STATUS_TONE[status])}>
      <span className="sr-only">{t("fields.status")}: </span>
      {t(`statuses.${status}`)}
    </span>
  );
}
