import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ActivityList } from "@/components/project/activity-list";
import { Link } from "@/i18n/navigation";
import { listActivity } from "@/lib/activity/service";
import { projectBilling } from "@/lib/billing/summary";
import { isSignable } from "@/lib/documents/reference";
import { listDocuments } from "@/lib/documents/service";
import { formatMoney } from "@/lib/money";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/project/[slug]">): Promise<Metadata> {
  const { project } = await projectPageAccess((await params).slug);
  return { title: project.name, robots: { index: false } };
}

export default async function ProjectOverviewPage({
  params,
}: PageProps<"/[locale]/project/[slug]">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const { project, actor } = access;
  // Everything the page shows is asked for together; each separate await is a round trip.
  const [billing, docs, activity, t, statuses, locale] = await Promise.all([
    projectBilling(project),
    listDocuments(access),
    listActivity(project.id, { limit: 5 }),
    getTranslations("project.overview"),
    getTranslations("documents.statuses"),
    getLocale(),
  ]);
  const base = `/project/${slug}`;
  const money = (n: number) => formatMoney(n, billing.currency, locale);
  const contracts = docs.filter((d) => isSignable(d.type));
  const figures = [
    { key: "invoiced", value: billing.totals.invoiced },
    { key: "paid", value: billing.totals.paid },
    { key: "outstanding", value: billing.totals.outstanding },
    { key: "overdue", value: billing.totals.overdue },
  ] as const;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-8">
        <section aria-labelledby="money-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="money-heading" className="font-medium">
              {t("money")}
            </h2>
            <Link
              href={`${base}/billing`}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("openBilling")}
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-3">
            {figures.map((f) => (
              <div key={f.key} className="rounded-lg border border-border p-4">
                <dt className="text-sm text-muted-foreground">{t(`figures.${f.key}`)}</dt>
                <dd
                  className={
                    f.key === "overdue" && f.value > 0
                      ? "mt-1 font-mono text-base font-semibold text-error"
                      : "mt-1 font-mono text-base font-semibold"
                  }
                >
                  {money(f.value)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="contracts-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="contracts-heading" className="font-medium">
              {t("contracts")}
            </h2>
            <Link
              href={`${base}/documents`}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("openDocuments")}
            </Link>
          </div>
          {contracts.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {contracts.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`${base}/documents/${d.slug}`}
                    className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 hover:bg-surface"
                  >
                    <span className="truncate">{d.title}</span>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {statuses(d.status)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-border-strong p-5 text-muted-foreground">
              {t("noContracts")}
            </p>
          )}
        </section>
      </div>

      <aside className="space-y-8">
        {project.description ? (
          <section aria-labelledby="about-heading">
            <h2 id="about-heading" className="mb-2 font-medium">
              {t("about")}
            </h2>
            <p className="text-sm text-pretty text-muted-foreground">{project.description}</p>
          </section>
        ) : null}
        <section aria-labelledby="recent-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="recent-heading" className="font-medium">
              {t("recentActivity")}
            </h2>
            <Link
              href={`${base}/activity`}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("allActivity")}
            </Link>
          </div>
          {activity.items.length > 0 ? (
            <ActivityList items={activity.items} viewerName={actor.name} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
          )}
        </section>
      </aside>
    </div>
  );
}
