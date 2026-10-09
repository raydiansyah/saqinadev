import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { LogRequestButton } from "@/components/engagement/request-form";
import { RequestsInbox } from "@/components/engagement/requests-inbox";
import { can } from "@/lib/auth/permissions";
import { listRequests } from "@/lib/engagement/requests";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("engagement.requests");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function RequestsPage({
  params,
}: PageProps<"/[locale]/project/[slug]/requests">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const [t, rows] = await Promise.all([
    getTranslations("engagement.requests"),
    listRequests(access.project.id),
  ]);
  const canWrite = can(access.role, "content:write");

  return (
    <>
      <PageHeading
        title={t("title")}
        description={t("description")}
        actions={canWrite ? <LogRequestButton slug={slug} /> : undefined}
      />
      <RequestsInbox
        slug={slug}
        canWrite={canWrite}
        canConvert={can(access.role, "project:update")}
        requests={rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          side: r.side,
          title: r.title,
          body: r.body,
          status: r.status,
          scopeStatus: r.scopeStatus,
          classification: r.classification,
          suggestedClassification: r.suggestedClassification,
          changeRequestId: r.changeRequestId,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
