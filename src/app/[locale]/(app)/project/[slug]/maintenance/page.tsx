import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { PlansPanel } from "@/components/engagement/plans-panel";
import { WarrantyForm } from "@/components/engagement/warranty-form";
import { can } from "@/lib/auth/permissions";
import { todayIso } from "@/lib/billing/rules";
import { daysUntil } from "@/lib/maintenance/classify";
import { listPlans } from "@/lib/maintenance/service";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("engagement.maintenance");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function MaintenancePage({
  params,
}: PageProps<"/[locale]/project/[slug]/maintenance">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const { project } = access;
  const [t, plans] = await Promise.all([
    getTranslations("engagement.maintenance"),
    listPlans(project.id),
  ]);
  const today = todayIso();

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
      </div>
    </>
  );
}
