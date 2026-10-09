import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { PortalProjectCard } from "@/components/portal/project-card";
import { requireActorPage } from "@/lib/auth/server";
import { portalProjects } from "@/lib/portal/access";
import { clientProjectSummaries } from "@/lib/portal/views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.projects");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function PortalProjectsPage() {
  const actor = await requireActorPage("/portal/projects");
  const rows = await portalProjects(actor);
  const projects = await clientProjectSummaries(rows.map((r) => r.project));
  const t = await getTranslations("portal");
  return (
    <>
      <PageHeading title={t("projects.title")} description={t("projects.description")} />
      {projects.length === 0 ? (
        <EmptyState title={t("dashboard.emptyTitle")} body={t("dashboard.emptyBody")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <PortalProjectCard key={p.slug} project={p} />
          ))}
        </div>
      )}
    </>
  );
}
