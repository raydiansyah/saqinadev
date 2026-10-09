import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import type { ClientProjectSummary } from "@/lib/portal/views";
import { ProgressBar, StageBadge, StagePointers } from "./progress";

/** One shared project on the portal dashboard: progress, stage and what is still owed. */
export async function PortalProjectCard({ project }: { project: ClientProjectSummary }) {
  const t = await getTranslations("portal");
  const locale = await getLocale();
  const { totals, currency } = project;
  return (
    <article className="relative flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 transition-colors focus-within:border-primary/60 hover:border-border-strong">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 font-semibold break-words">
          <Link
            href={`/portal/projects/${project.slug}`}
            aria-label={t("dashboard.open", { name: project.name })}
            className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none"
          >
            {project.name}
          </Link>
        </h3>
        <StageBadge stage={project.stage} />
      </div>
      <ProgressBar percent={project.progress.percent} />
      <StagePointers progress={project.progress} />
      <dl className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4 text-sm">
        <div>
          <dt className="text-muted-foreground">{t("money.outstanding")}</dt>
          <dd className="font-mono">{formatMoney(totals.outstanding, currency, locale)}</dd>
        </div>
        {totals.overdue > 0 ? (
          <div>
            <dt className="text-error">{t("money.overdue")}</dt>
            <dd className="font-mono text-error">
              {formatMoney(totals.overdue, currency, locale)}
            </dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}
