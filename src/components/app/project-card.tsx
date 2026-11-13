import { getLocale, getTranslations } from "next-intl/server";
import { ProjectStatusBadge } from "@/components/project/project-status";
import { Link } from "@/i18n/navigation";
import { formatRelative } from "@/lib/format";
import type { ProjectSummary } from "@/lib/projects/service";

/** A project at a glance: name, state and when it last changed. */
export async function ProjectCard({ project }: { project: ProjectSummary }) {
  const t = await getTranslations("app.dashboard");
  const locale = await getLocale();
  return (
    <article className="relative flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 transition-colors focus-within:border-border-strong hover:border-border-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">
            <Link
              href={`/project/${project.slug}`}
              className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none"
            >
              {project.name}
            </Link>
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
        </div>
        <ProjectStatusBadge status={project.status} className="shrink-0" />
      </div>
      <p className="border-t border-border pt-3 text-xs text-subtle-foreground">
        {t("updated", { time: formatRelative(project.updatedAt, locale) })}
      </p>
    </article>
  );
}
