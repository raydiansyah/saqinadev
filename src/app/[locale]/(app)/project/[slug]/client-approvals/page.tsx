import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { ApprovalsPanel } from "@/components/engagement/approvals-panel";
import { can } from "@/lib/auth/permissions";
import { fileName, listDocuments } from "@/lib/documents/service";
import { listApprovals } from "@/lib/engagement/approvals";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("engagement.approvals");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function ClientApprovalsPage({
  params,
}: PageProps<"/[locale]/project/[slug]/client-approvals">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const [t, approvals, docs] = await Promise.all([
    getTranslations("engagement.approvals"),
    listApprovals(access.project.id),
    listDocuments(access),
  ]);
  const { project } = access;
  const name = (d: (typeof docs)[number]) =>
    d.type === "custom" ? `${fileName(d.slug)} (${d.title})` : fileName(d.slug);
  const byId = new Map(docs.map((d) => [d.id, d]));

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <ApprovalsPanel
        slug={slug}
        canWrite={can(access.role, "project:update")}
        portalReady={Boolean(project.clientId && project.portalEnabled)}
        documents={docs
          .filter((d) => d.status === "approved" || d.status === "signed")
          .map((d) => ({ slug: d.slug, name: name(d) }))}
        approvals={approvals.map((a) => {
          const doc = a.documentId ? byId.get(a.documentId) : undefined;
          return {
            id: a.id,
            title: a.title,
            description: a.description,
            status: a.status,
            responseNote: a.responseNote,
            docSlug: doc?.slug ?? null,
            docName: doc ? name(doc) : null,
            link: a.link,
            createdAt: a.createdAt.toISOString(),
          };
        })}
      />
    </>
  );
}
