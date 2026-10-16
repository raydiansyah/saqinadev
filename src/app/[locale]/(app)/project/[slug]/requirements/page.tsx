import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { RequirementList } from "@/components/requirements/requirement-list";
import { SyncFromDocs } from "@/components/requirements/sync-from-docs";
import { isLocale } from "@/i18n/locales";
import { can } from "@/lib/auth/permissions";
import { REQUIREMENT_GROUPS } from "@/lib/domain/enums";
import { hasRepoDocs } from "@/lib/imports/persist-requirements";
import { getProjectCopy } from "@/lib/interviews/copy";
import { projectPageAccess } from "@/lib/projects/page";
import { listRequirements } from "@/lib/requirements/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("requirements");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function RequirementsPage({
  params,
}: PageProps<"/[locale]/project/[slug]/requirements">) {
  const { slug, locale } = await params;
  const access = await projectPageAccess(slug);
  const [items, repoDocs] = await Promise.all([
    listRequirements(access),
    hasRepoDocs(access.project.id),
  ]);
  const t = await getTranslations("requirements");
  const copy = getProjectCopy(isLocale(locale) ? locale : "en");
  const counts = { confirmed: 0, inferred: 0, unknown: 0, conflicting: 0 };
  for (const r of items) counts[r.status] += 1;

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      {items.length > 0 ? (
        <p className="-mt-4 mb-6 font-mono text-xs text-muted-foreground">{t("summary", counts)}</p>
      ) : null}
      {repoDocs && can(access.role, "content:write") ? <SyncFromDocs slug={slug} /> : null}
      <RequirementList
        slug={slug}
        items={items}
        canEdit={can(access.role, "content:write")}
        groupLabels={
          Object.fromEntries(REQUIREMENT_GROUPS.map((g) => [g, copy.groups[g]])) as Record<
            (typeof REQUIREMENT_GROUPS)[number],
            string
          >
        }
      />
    </>
  );
}
