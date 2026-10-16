import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import { DocumentPage } from "@/components/documents/document-page";
import { PrdFindingsPanel } from "@/components/documents/prd-findings-panel";
import { can } from "@/lib/auth/permissions";
import { listPrdFindings } from "@/lib/brain/prd-findings";
import { getDocument } from "@/lib/documents/service";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("documents");
  return { title: t("prdMetaTitle"), robots: { index: false } };
}

export default async function PrdPage({ params }: PageProps<"/[locale]/project/[slug]/prd">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const t = await getTranslations("documents");
  const exists = await getDocument(access, "prd");
  const findings = await listPrdFindings(access);
  return (
    <>
      <p className="mb-6 max-w-2xl text-muted-foreground">{t("prdDescription")}</p>
      <PrdFindingsPanel
        slug={slug}
        canWrite={can(access.role, "content:write")}
        findings={findings.map((f) => ({
          id: f.id,
          kind: f.kind,
          subject: f.subject,
          proposable: f.kind === "requirement_not_in_prd" && !f.proposalId,
          proposed: Boolean(f.proposalId),
        }))}
      />
      {exists ? (
        <DocumentPage access={access} docSlug="prd" />
      ) : (
        <EmptyState
          title="PRD.md"
          body={(await getTranslations("project.overview"))("interviewPending")}
        />
      )}
    </>
  );
}
