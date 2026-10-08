import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { CreateDecisionButton } from "@/components/decisions/decision-buttons";
import { DecisionCard } from "@/components/decisions/decision-card";
import { can } from "@/lib/auth/permissions";
import { listDecisions } from "@/lib/decisions/service";
import { formatDateTime } from "@/lib/format";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("decisions");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function DecisionsPage({
  params,
}: PageProps<"/[locale]/project/[slug]/decisions">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const [decisions, t, locale] = await Promise.all([
    listDecisions(access),
    getTranslations("decisions"),
    getLocale(),
  ]);
  const canEdit = can(access.role, "content:write");
  const createButton = canEdit ? <CreateDecisionButton slug={slug} /> : null;

  return (
    <>
      <PageHeading
        title={t("title")}
        description={t("description")}
        actions={decisions.length > 0 ? createButton : null}
      />
      {decisions.length > 0 ? (
        <ol className="space-y-4">
          {decisions.map((d) => (
            <li key={d.id}>
              <DecisionCard
                slug={slug}
                decision={d}
                createdLabel={formatDateTime(d.createdAt, locale)}
                canEdit={canEdit}
              />
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title={t("title")} body={t("empty")} action={createButton} />
      )}
    </>
  );
}
