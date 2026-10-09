import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { Chip } from "@/components/engagement/chip";
import { PlansPanel } from "@/components/engagement/plans-panel";
import { WarrantyForm } from "@/components/engagement/warranty-form";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { todayIso } from "@/lib/billing/rules";
import { listRequests } from "@/lib/engagement/requests";
import { daysUntil } from "@/lib/maintenance/classify";
import { listPlans } from "@/lib/maintenance/service";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("engagement.maintenance");
  return { title: t("metaTitle"), robots: { index: false } };
}

const CLASS_TONE = {
  unclassified: "neutral",
  warranty: "info",
  included: "success",
  paid: "warning",
} as const;

export default async function MaintenancePage({
  params,
}: PageProps<"/[locale]/project/[slug]/maintenance">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const { project } = access;
  const [t, tr, plans, requests] = await Promise.all([
    getTranslations("engagement.maintenance"),
    getTranslations("engagement.requests"),
    listPlans(project.id),
    listRequests(project.id),
  ]);
  const today = todayIso();
  const support = requests.filter((r) => r.kind === "maintenance" || r.kind === "bug");

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <div className="space-y-6">
        <WarrantyForm
          slug={slug}
          warrantyUntil={project.warrantyUntil}
          daysLeft={project.warrantyUntil ? daysUntil(project.warrantyUntil, today) : null}
          canWrite={can(access.role, "project:update")}
        />
        <PlansPanel
          slug={slug}
          currency={project.currency}
          canWrite={can(access.role, "billing:write")}
          plans={plans.map((p) => ({
            id: p.id,
            name: p.name,
            startDate: p.startDate,
            endDate: p.endDate,
            fee: p.fee,
            cycle: p.cycle,
            scope: p.scope,
            excluded: p.excluded,
            responseHours: p.responseHours,
            status: p.status,
            daysLeft: daysUntil(p.endDate, today),
          }))}
        />
        <section className="rounded-lg border border-border p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">{t("requestsTitle")}</h2>
            <Link
              href={`/project/${slug}/requests`}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              {t("triage")}
            </Link>
          </div>
          {support.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("requestsEmpty")}</p>
          ) : (
            <ul className="mt-4 divide-y divide-border rounded-md border border-border">
              {support.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <Chip tone="neutral">{tr(`kinds.${r.kind}`)}</Chip>
                  <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {tr(`statuses.${r.status}`)}
                  </span>
                  <Chip tone={CLASS_TONE[r.classification]}>
                    {tr(`classes.${r.classification}`)}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
