import { getTranslations } from "next-intl/server";
import type { ProjectStatus } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";

const TONE: Record<ProjectStatus, string> = {
  draft: "text-subtle-foreground border-border",
  interview: "text-info border-info/40",
  planning: "text-info border-info/40",
  ready: "text-success border-success/40",
  building: "text-info border-info/40",
  review: "text-warning border-warning/40",
  paused: "text-subtle-foreground border-border",
  completed: "text-success border-success/40",
  archived: "text-subtle-foreground border-border",
};

export async function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  const t = await getTranslations("project.statuses");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-xs leading-none whitespace-nowrap",
        TONE[status],
        className,
      )}
    >
      {t(status)}
    </span>
  );
}
