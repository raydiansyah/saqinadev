import { getLocale, getTranslations } from "next-intl/server";
import { formatRelative } from "@/lib/format";
import type { ProjectRow } from "@/lib/projects/repository";
import { ProjectStatusBadge } from "./project-status";

/** Name, state and freshness on every project page. */
export async function ProjectHeader({ project }: { project: ProjectRow }) {
  const t = await getTranslations("project");
  const locale = await getLocale();
  return (
    <div className="border-b border-border pb-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="truncate text-lg font-semibold tracking-tight">{project.name}</p>
        <ProjectStatusBadge status={project.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("header.updated", { time: formatRelative(project.updatedAt, locale) })}
      </p>
    </div>
  );
}
