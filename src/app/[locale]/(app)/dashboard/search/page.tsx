import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireActorPage } from "@/lib/auth/server";
import { search } from "@/lib/search/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.search");
  return { title: t("title"), robots: { index: false } };
}

export default async function SearchPage({
  searchParams,
}: PageProps<"/[locale]/dashboard/search">) {
  const actor = await requireActorPage("/dashboard/search");
  const raw = (await searchParams).q;
  const query = typeof raw === "string" ? raw.trim().slice(0, 100) : "";
  const hits = query.length >= 2 ? await search(actor, query) : [];
  const t = await getTranslations("app.search");
  const locale = await getLocale();

  return (
    <>
      <PageHeading title={t("title")} />
      <form
        role="search"
        action={`/${locale}/dashboard/search`}
        className="mb-8 flex max-w-xl gap-2"
      >
        <label htmlFor="search-page-q" className="sr-only">
          {t("label")}
        </label>
        <input
          id="search-page-q"
          name="q"
          type="search"
          defaultValue={query}
          minLength={2}
          maxLength={100}
          placeholder={t("placeholder")}
          className="min-h-11 flex-1 rounded-md border border-border-strong bg-surface px-3.5 text-[0.9375rem] focus-visible:border-primary"
        />
        <Button type="submit">{t("submit")}</Button>
      </form>
      {query.length < 2 ? (
        query ? (
          <p className="text-muted-foreground">{t("tooShort")}</p>
        ) : null
      ) : hits.length === 0 ? (
        <EmptyState title={t("resultsFor", { query })} body={t("empty", { query })} />
      ) : (
        <section aria-labelledby="results-heading">
          <h2 id="results-heading" className="mb-4 text-sm text-muted-foreground">
            {t("resultsFor", { query })}
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {hits.map((hit) => (
              <li key={`${hit.kind}:${hit.id}`}>
                <Link
                  href={`/project/${hit.projectSlug}${hit.path}`}
                  className="flex min-h-14 flex-col justify-center gap-0.5 px-4 py-2 hover:bg-surface sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium">{hit.title}</span>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-mono">{t(`kinds.${hit.kind}`)}</span> · {hit.projectName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
