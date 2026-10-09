import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { ChangesPanel } from "@/components/engagement/changes-panel";
import { can } from "@/lib/auth/permissions";
import { crNumber, listChangeRequests } from "@/lib/change-requests/service";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("engagement.changes");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function ChangesPage({
  params,
}: PageProps<"/[locale]/project/[slug]/changes">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const [t, rows] = await Promise.all([
    getTranslations("engagement.changes"),
    listChangeRequests(access.project.id),
  ]);
  const { project } = access;

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <ChangesPanel
        slug={slug}
        currency={project.currency}
        canWrite={can(access.role, "project:update")}
        canDecide={can(access.role, "billing:write")}
        portalReady={Boolean(project.clientId && project.portalEnabled)}
        changes={rows.map((c) => ({
          id: c.id,
          number: crNumber(c.number),
          title: c.title,
          description: c.description,
          impact: c.impact,
          additionalCost: c.additionalCost,
          additionalDays: c.additionalDays,
          status: c.status,
          scopeStatus: c.scopeStatus,
          decisionNote: c.decisionNote,
        }))}
      />
    </>
  );
}
