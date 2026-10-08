import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatRelative } from "@/lib/format";
import type { NextAction } from "@/lib/projects/progress";
import type { ProjectRow } from "@/lib/projects/repository";
import { ProjectStatusBadge } from "./project-status";

/** Name, state, freshness and the one action that matters next, on every project page. */
export async function ProjectHeader({ project, next }: { project: ProjectRow; next: NextAction }) {
  const t = await getTranslations("project");
  const locale = await getLocale();
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-lg font-semibold tracking-tight">{project.name}</p>
          <ProjectStatusBadge status={project.status} />
          {project.isDemo ? (
            <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-subtle-foreground">
              {t("header.demo")}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("header.updated", { time: formatRelative(project.updatedAt, locale) })}
        </p>
      </div>
      <Link
        href={`/project/${project.slug}${next.path}`}
        className={buttonVariants({ size: "sm", className: "self-start sm:self-auto" })}
      >
        {t(`nextActions.${next.kind}`)}
      </Link>
    </div>
  );
}
