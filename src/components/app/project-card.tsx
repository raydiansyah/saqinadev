import { getLocale, getTranslations } from "next-intl/server";
import { Pipeline } from "@/components/project/pipeline";
import { ProjectStatusBadge } from "@/components/project/project-status";
import { Link } from "@/i18n/navigation";
import { formatRelative } from "@/lib/format";
import { attentionCount, pipelineStages } from "@/lib/projects/progress";
import type { ProjectSummary } from "@/lib/projects/service";

/** A project at a glance: state, progress and the next meaningful step. */
export async function ProjectCard({ project }: { project: ProjectSummary }) {
  const t = await getTranslations();
  const locale = await getLocale();
  const href = `/project/${project.slug}`;
  const attention = attentionCount(project.snapshot);
  return (
    <article className="relative flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 transition-colors focus-within:border-border-strong hover:border-border-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">
            <Link
              href={href}
              className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none"
            >
              {project.name}
            </Link>
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {project.isDemo ? (
            <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-subtle-foreground">
              {t("app.dashboard.demo")}
            </span>
          ) : null}
          <ProjectStatusBadge status={project.status} />
        </div>
      </div>
      {attention > 0 ? (
        <p className="-mt-2 inline-flex w-fit items-center gap-1.5 rounded-md border border-warning/50 px-2 py-0.5 text-xs text-warning">
          <span aria-hidden="true" className="font-mono">
            !
          </span>
          {t("assistant.overview.needAttention", { count: attention })}
        </p>
      ) : null}
      <Pipeline stages={pipelineStages(project.snapshot)} compact />
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3 text-sm">
        <p>
          <span className="text-muted-foreground">{t("app.dashboard.next")} </span>
          <span className="font-medium">{t(`project.nextActions.${project.nextAction.kind}`)}</span>
        </p>
        <p className="text-xs text-subtle-foreground">
          {t("app.dashboard.updated", { time: formatRelative(project.updatedAt, locale) })}
        </p>
      </div>
    </article>
  );
}
