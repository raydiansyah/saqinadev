import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/portal/engagement/status-badge";
import { formatDay } from "@/components/portal/format";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { clientMaintenance } from "@/lib/portal/engagement-views";
import { portalPageAccess } from "../../../access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portalEngagement.maintenance");
  return { title: t("metaTitle") };
}

type Cycle = "monthly" | "quarterly" | "yearly" | "one_time";
const CYCLES: readonly string[] = ["monthly", "quarterly", "yearly", "one_time"];

export default async function PortalMaintenancePage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/maintenance">) {
  const { slug } = await params;
  const view = await clientMaintenance(await portalPageAccess(slug));
  const [t, locale] = await Promise.all([
    getTranslations("portalEngagement.maintenance"),
    getLocale(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const until = view.warrantyUntil;
  const warranty = !until
    ? t("warrantyNotSet")
    : until >= today
      ? t("warrantyUntil", { date: formatDay(until, locale) ?? until })
      : t("warrantyEnded", { date: formatDay(until, locale) ?? until });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="mt-1 max-w-prose text-muted-foreground">{t("explain")}</p>
      </div>

      <section
        aria-labelledby="warranty-heading"
        className="rounded-lg border border-border bg-surface p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="warranty-heading" className="font-medium">
            {t("warrantyTitle")}
          </h3>
          {until ? (
            <StatusBadge
              label={until >= today ? t("planStatus.active") : t("planStatus.ended")}
              tone={until >= today ? "good" : "neutral"}
            />
          ) : null}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{warranty}</p>
      </section>

      <section aria-labelledby="plans-heading" className="space-y-3">
        <h3 id="plans-heading" className="font-medium">
          {t("plansTitle")}
        </h3>
        {view.plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("plansEmpty")}</p>
        ) : (
          <ul className="space-y-4">
            {view.plans.map((plan) => {
              const cycle = CYCLES.includes(plan.cycle) ? t(`cycle.${plan.cycle as Cycle}`) : "";
              return (
                <li
                  key={`${plan.name}-${plan.startDate}`}
                  className="space-y-4 rounded-lg border border-border bg-surface p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h4 className="min-w-0 font-medium break-words">{plan.name}</h4>
                    <StatusBadge
                      label={
                        plan.status === "active" ? t("planStatus.active") : t("planStatus.ended")
                      }
                      tone={plan.status === "active" ? "good" : "neutral"}
                    />
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">{t("period")}</dt>
                      <dd className="mt-1">
                        {t("periodValue", {
                          start: formatDay(plan.startDate, locale) ?? plan.startDate,
                          end: formatDay(plan.endDate, locale) ?? plan.endDate,
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("fee")}</dt>
                      <dd className="mt-1 break-words">
                        {t("feeValue", {
                          amount: formatMoney(plan.fee, plan.currency, locale),
                          cycle,
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("responseTime")}</dt>
                      <dd className="mt-1">
                        {plan.responseHours
                          ? t("responseHours", { hours: plan.responseHours })
                          : t("responseNotSet")}
                      </dd>
                    </div>
                  </dl>
                  {plan.scope ? (
                    <div className="text-sm">
                      <p className="text-muted-foreground">{t("included")}</p>
                      <p className="mt-1 break-words whitespace-pre-line">{plan.scope}</p>
                    </div>
                  ) : null}
                  {plan.excluded ? (
                    <div className="text-sm">
                      <p className="text-muted-foreground">{t("notIncluded")}</p>
                      <p className="mt-1 break-words whitespace-pre-line">{plan.excluded}</p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="maintenance-request-heading"
        className="rounded-lg border border-dashed border-border-strong p-5"
      >
        <h3 id="maintenance-request-heading" className="font-medium">
          {t("requestTitle")}
        </h3>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">{t("requestBody")}</p>
        <Link
          href={{ pathname: `/portal/projects/${slug}/requests`, query: { kind: "maintenance" } }}
          className={buttonVariants({ className: "mt-4 w-full sm:w-auto" })}
        >
          {t("requestCta")}
        </Link>
      </section>
    </div>
  );
}
