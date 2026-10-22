import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { MemoryTabs } from "@/components/memory/memory-tabs";
import { WikiPassageCard } from "@/components/memory/wiki-passage";
import { WikiReindexButton } from "@/components/memory/wiki-reindex-button";
import { LocalTime } from "@/components/primitives/local-time";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { principalOf } from "@/lib/memory/access";
import { getOverview } from "@/lib/memory/queries";
import { listWikiSources } from "@/lib/memory/wiki/queries";
import { retrieveWiki } from "@/lib/memory/wiki/retrieve";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("memoryHub.wiki");
  return { title: t("title"), robots: { index: false } };
}

export default async function WikiPage({
  params,
  searchParams,
}: PageProps<"/[locale]/project/[slug]/memory/wiki">) {
  const { slug } = await params;
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 200) : "";
  const access = await projectPageAccess(slug);
  const admin = access.role === "owner" || access.role === "admin";
  const [sources, overview, found, t] = await Promise.all([
    listWikiSources(access),
    getOverview(access),
    q ? retrieveWiki(principalOf(access), access.project.id, { query: q }) : null,
    getTranslations("memoryHub.wiki"),
  ]);
  const base = `/project/${slug}/memory`;

  return (
    <>
      <PageHeading
        title={t("title")}
        description={t("description")}
        actions={admin ? <WikiReindexButton slug={slug} /> : null}
      />
      <MemoryTabs slug={slug} active="wiki" pending={overview.pendingReview} admin={admin} />

      <form
        action={`${base}/wiki`}
        method="get"
        role="search"
        className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="sm:w-96">
          <Field
            id="wiki-q"
            name="q"
            label={t("search")}
            placeholder={t("searchPlaceholder")}
            defaultValue={q}
            maxLength={200}
          />
        </div>
        <Button type="submit">{t("searchSubmit")}</Button>
      </form>

      {found ? (
        <section className="mb-10 space-y-3" aria-live="polite">
          {found.degraded ? (
            <p className="text-sm text-error">{t("degraded")}</p>
          ) : found.passages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noResults")}</p>
          ) : (
            <>
              <p className="text-xs text-subtle-foreground">{t("semantic")}</p>
              {found.passages.map((p) => (
                <WikiPassageCard key={`${p.sourceId}:${p.startLine}`} passage={p} />
              ))}
            </>
          )}
        </section>
      ) : null}

      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t("sources")}</h2>
      {sources.length === 0 ? (
        <EmptyState title={t("empty")} body={t("emptyBody")} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {sources.map((s) => (
            <li key={s.id} className="p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link href={`${base}/wiki/${s.id}`} className="font-medium hover:underline">
                  {s.title}
                </Link>
                <span className="font-mono text-xs break-all text-muted-foreground">
                  {s.sourceRef}
                </span>
              </div>
              {s.summary ? (
                <p className="mt-1 text-sm text-pretty text-muted-foreground">{s.summary}</p>
              ) : null}
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle-foreground">
                <span>{t(`type.${s.sourceType}`)}</span>
                <span>{t("passages", { n: s.chunkCount })}</span>
                <span>
                  {t("lastIndexed")}{" "}
                  <LocalTime iso={s.lastIndexedAt.toISOString()} className="font-mono" />
                </span>
                {s.status === "failed" ? (
                  <span className="text-error">
                    {s.errorCode === "too_large" ? t("tooLarge") : t("failed")}
                  </span>
                ) : null}
                {s.stale ? <span className="text-warning">{t("stale")}</span> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
