import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { NewDocumentButton } from "@/components/documents/new-document-button";
import { ShareToggle } from "@/components/documents/share-toggle";
import { BusinessDocs } from "@/components/engagement/business-docs";
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
  const share = await getTranslations("billing.share");
  const canShare = can(access.role, "project:update");
  const locale = await getLocale();

  return (
    <>
      <PageHeading
        title={t("title")}
        description={t("description")}
        actions={can(access.role, "content:write") ? <NewDocumentButton slug={slug} /> : undefined}
      />
      {canShare ? <BusinessDocs slug={slug} /> : null}
      {docs.length === 0 ? (
        <EmptyState title={t("title")} body={t("empty")} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-col sm:flex-row sm:items-center">
              <Link
                href={
                  d.slug === "prd" ? `/project/${slug}/prd` : `/project/${slug}/documents/${d.slug}`
                }
                className="flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-3 hover:bg-surface sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  <span className="font-mono text-sm font-medium">{fileName(d.slug)}</span>
                  {d.type === "custom" ? (
                    <span className="ml-2 text-sm text-muted-foreground">{d.title}</span>
                  ) : null}
                </span>
                <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono">{t("version", { version: d.version })}</span>
                  <span>{t(`statuses.${d.status}`)}</span>
                  {d.clientVisible ? <span className="text-success">{share("shared")}</span> : null}
                  <span>{t("updated", { time: formatRelative(d.updatedAt, locale) })}</span>
                </span>
              </Link>
              {canShare ? (
                <div className="px-4 pb-3 sm:pb-0">
                  <ShareToggle
                    slug={slug}
                    docSlug={d.slug}
                    approved={d.status === "approved"}
                    shared={d.clientVisible}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
