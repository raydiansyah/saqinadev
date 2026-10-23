import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { type DocAudience, listDocs } from "@/lib/docs/content";

/** The list of guides for one audience. The page decides who may see it. */
export async function DocIndex({
  audience,
  locale,
  base,
}: {
  audience: DocAudience;
  locale: Locale;
  base: string;
}) {
  const t = await getTranslations({ locale, namespace: "docs" });
  const docs = listDocs(audience, locale);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {t(`${audience}.title`)}
        </h1>
        <p className="mt-1 text-muted-foreground">{t(`${audience}.intro`)}</p>
      </div>
      {docs.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {docs.map((doc) => (
            <li key={doc.slug}>
              <Link href={`${base}/${doc.slug}`} className="block px-5 py-4 hover:bg-surface">
                <span className="font-medium">{doc.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{doc.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
