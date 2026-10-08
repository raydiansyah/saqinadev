import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { NewDocumentButton } from "@/components/documents/new-document-button";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { fileName, listDocuments } from "@/lib/documents/service";
import { formatRelative } from "@/lib/format";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("documents");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function DocumentsPage({
  params,
}: PageProps<"/[locale]/project/[slug]/documents">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const docs = await listDocuments(access);
  const t = await getTranslations("documents");
  const locale = await getLocale();

  return (
    <>
      <PageHeading
        title={t("title")}
        description={t("description")}
        actions={can(access.role, "content:write") ? <NewDocumentButton slug={slug} /> : undefined}
      />
      {docs.length === 0 ? (
        <EmptyState title={t("title")} body={t("empty")} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {docs.map((d) => (
            <li key={d.id}>
              <Link
                href={
                  d.slug === "prd" ? `/project/${slug}/prd` : `/project/${slug}/documents/${d.slug}`
                }
                className="flex min-h-14 flex-col justify-center gap-1 px-4 py-3 hover:bg-surface sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  <span className="font-mono text-sm font-medium">{fileName(d.slug)}</span>
                  {d.type === "custom" ? (
                    <span className="ml-2 text-sm text-muted-foreground">{d.title}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono">{t("version", { version: d.version })}</span>
                  <span>{t(`statuses.${d.status}`)}</span>
                  <span>{t("updated", { time: formatRelative(d.updatedAt, locale) })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
