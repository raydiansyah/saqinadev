import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import { ProgressBar, StageList } from "@/components/portal/progress";
import { portalProjectView } from "../../../access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.progress");
  return { title: t("title") };
}

export default async function PortalProgressPage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/progress">) {
  const { slug } = await params;
  const view = await portalProjectView(slug);
  const t = await getTranslations("portal.progress");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>
      <ProgressBar percent={view.progress.percent} />
      {view.progress.stages.length === 0 ? (
        <EmptyState title={t("title")} body={t("empty")} />
      ) : (
        <StageList stages={view.progress.stages} />
      )}
    </div>
  );
}
