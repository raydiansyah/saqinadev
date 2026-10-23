import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import MarkdownPreview from "@/components/documents/markdown-preview";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { type DocAudience, getDoc } from "@/lib/docs/content";

/** One guide: title, when it was last checked, and the Markdown (screenshots and diagrams included). */
export async function DocArticle({
  audience,
  locale,
  slug,
  base,
}: {
  audience: DocAudience;
  locale: Locale;
  slug: string;
  base: string;
}) {
  const doc = getDoc(audience, locale, slug);
  if (!doc) notFound();
  const t = await getTranslations({ locale, namespace: "docs" });
  const updated = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    dateStyle: "long",
  }).format(new Date(`${doc.updated}T00:00:00Z`));
  return (
    <div className="max-w-3xl">
      <Link href={base} className="inline-flex min-h-11 items-center text-sm text-primary">
        ← {t("all")}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">{doc.title}</h1>
      <p className="mt-3 text-pretty text-muted-foreground">{doc.description}</p>
      <p className="mt-3 font-mono text-xs text-subtle-foreground">
        {t("updated")}: <time dateTime={doc.updated}>{updated}</time>
      </p>
      <article className="mt-10">
        <MarkdownPreview content={doc.body} />
      </article>
    </div>
  );
}
