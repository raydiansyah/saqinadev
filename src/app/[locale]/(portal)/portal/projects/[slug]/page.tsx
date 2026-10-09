import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { loadAttention, NeedsAttention } from "@/components/portal/engagement/attention";
import { formatDate } from "@/components/portal/format";
import { BillingTotalsList } from "@/components/portal/money";
import { ProgressBar, StagePointers } from "@/components/portal/progress";
import { clientActivity } from "@/lib/portal/views";
import { portalPageAccess, portalProjectView } from "../../access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.overview");
  return { title: t("metaTitle") };
}

export default async function PortalOverviewPage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]">) {
  const { slug } = await params;
  const access = await portalPageAccess(slug);
  const [view, activity, attention, t, locale] = await Promise.all([
    portalProjectView(slug),
    clientActivity(access),
    loadAttention(access),
    getTranslations("portal.overview"),
    getLocale(),
  ]);

  return (
    <div className="space-y-10">
      <NeedsAttention items={[attention]} />
      <section aria-labelledby="about-heading">
        <h2 id="about-heading" className="mb-3 font-medium">
          {t("about")}
        </h2>
        <p className="max-w-prose break-words whitespace-pre-line text-muted-foreground">
          {view.description.trim() || t("noDescription")}
        </p>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <ProgressBar percent={view.progress.percent} />
        <StagePointers progress={view.progress} />
      </section>

      <section aria-labelledby="billing-heading">
        <h2 id="billing-heading" className="mb-3 font-medium">
          {t("billing")}
        </h2>
        <BillingTotalsList totals={view.totals} currency={view.currency} />
      </section>

      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="mb-3 font-medium">
          {t("activity")}
        </h2>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("activityEmpty")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {activity.slice(0, 10).map((item) => (
              <li
                key={`${item.kind}-${item.createdAt.toISOString()}-${item.label}`}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <span className="min-w-0 break-words">
                  {t(`kinds.${item.kind}`, { label: item.label })}
                </span>
                <time
                  dateTime={item.createdAt.toISOString()}
                  className="shrink-0 text-sm text-muted-foreground"
                >
                  {formatDate(item.createdAt, locale)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
