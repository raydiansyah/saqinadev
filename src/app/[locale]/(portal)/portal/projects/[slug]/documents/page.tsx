import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import { formatDate } from "@/components/portal/format";
import { Link } from "@/i18n/navigation";
import { clientDocuments } from "@/lib/portal/views";
import { portalPageAccess } from "../../../access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.documents");
  return { title: t("metaTitle") };
}

export default async function PortalDocumentsPage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/documents">) {
  const { slug } = await params;
  const docs = await clientDocuments(await portalPageAccess(slug));
  const [t, locale] = await Promise.all([getTranslations("portal.documents"), getLocale()]);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>
      {docs.length === 0 ? (
        <EmptyState title={t("title")} body={t("empty")} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {docs.map((doc) => (
            <li key={doc.slug}>
              <Link
                href={`/portal/projects/${slug}/documents/${doc.slug}`}
                className="flex min-h-11 flex-col gap-1 px-4 py-3 hover:bg-surface sm:flex-row sm:items-baseline sm:justify-between"
              >
                <span className="min-w-0 font-medium break-words">{doc.title}</span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {t("version", { version: doc.version })} ·{" "}
                  {t("updated", { date: formatDate(doc.updatedAt, locale) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
