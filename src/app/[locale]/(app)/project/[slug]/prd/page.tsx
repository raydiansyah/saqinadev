import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import { DocumentPage } from "@/components/documents/document-page";
import { PrdFindingsPanel } from "@/components/documents/prd-findings-panel";
import { PrdGenerator } from "@/components/documents/prd-generator";
import { PrdPicker } from "@/components/documents/prd-picker";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { listPrdFindings } from "@/lib/brain/prd-findings";
import { getDocument } from "@/lib/documents/service";
import { isGithubSourced, listPrdCandidates } from "@/lib/imports/choose-prd";
import { getPrdBrief } from "@/lib/prd/service";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("documents");
  return { title: t("prdMetaTitle"), robots: { index: false } };
}

export default async function PrdPage({
  params,
  searchParams,
}: PageProps<"/[locale]/project/[slug]/prd">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const t = await getTranslations("documents");
  const canWrite = can(access.role, "content:write");
  // Generate PRD: a form filled from the project, each section improvable, saved as the PRD.
  if (canWrite && (await searchParams).generate === "1")
    return <PrdGenerator slug={slug} view={await getPrdBrief(access)} />;
  const exists = await getDocument(access, "prd");
  const findings = await listPrdFindings(access);
  const candidates = exists ? [] : await listPrdCandidates(access);
  const asksForPrd = !exists && (candidates.length > 0 || (await isGithubSourced(access)));
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-muted-foreground">{t("prdDescription")}</p>
        {canWrite ? (
          <Link
            href={`/project/${slug}/prd?generate=1`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("prdGenerate.open")}
          </Link>
        ) : null}
      </div>
      <PrdFindingsPanel
        slug={slug}
        canWrite={canWrite}
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
      ) : asksForPrd && canWrite ? (
        <PrdPicker slug={slug} options={candidates} />
      ) : (
        <EmptyState
          title="PRD.md"
          body={(await getTranslations("project.overview"))("interviewPending")}
        />
      )}
    </>
  );
}
