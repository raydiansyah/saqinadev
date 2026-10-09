import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import MarkdownPreview from "@/components/documents/markdown-preview";
import { formatDate } from "@/components/portal/format";
import { Link } from "@/i18n/navigation";
import { clientDocument } from "@/lib/portal/views";
import { orNotFound, portalPageAccess } from "../../../../access";

async function load(slug: string, doc: string) {
  return orNotFound(clientDocument(await portalPageAccess(slug), doc));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/documents/[doc]">): Promise<Metadata> {
  const { slug, doc } = await params;
  return { title: (await load(slug, doc)).title };
}

export default async function PortalDocumentPage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/documents/[doc]">) {
  const { slug, doc: docSlug } = await params;
  const doc = await load(slug, docSlug);
  const [t, locale] = await Promise.all([getTranslations("portal.documents"), getLocale()]);
  return (
    <article>
      <Link
        href={`/portal/projects/${slug}/documents`}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <span aria-hidden="true">←</span> {t("back")}
      </Link>
      <header className="mt-2 mb-6 border-b border-border pb-4">
        <h2 className="text-xl font-semibold break-words">{doc.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("version", { version: doc.version })} ·{" "}
          {t("updated", { date: formatDate(doc.updatedAt, locale) })}
        </p>
      </header>
      <div className="min-w-0 overflow-x-auto break-words">
        <MarkdownPreview content={doc.content} />
      </div>
    </article>
  );
}
