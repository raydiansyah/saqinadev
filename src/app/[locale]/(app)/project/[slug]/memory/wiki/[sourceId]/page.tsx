import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LocalTime } from "@/components/primitives/local-time";
import { Link } from "@/i18n/navigation";
import { isAppError } from "@/lib/errors";
import { getWikiPage } from "@/lib/memory/wiki/queries";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("memoryHub.wiki");
  return { title: t("title"), robots: { index: false } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WikiSourcePage({
  params,
}: PageProps<"/[locale]/project/[slug]/memory/wiki/[sourceId]">) {
  const { slug, sourceId } = await params;
  if (!UUID.test(sourceId)) notFound();
  const access = await projectPageAccess(slug);
  const page = await getWikiPage(access, sourceId).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const t = await getTranslations("memoryHub.wiki");
  const base = `/project/${slug}/memory/wiki`;
  const { source } = page;

  return (
    <article>
      <Link
        href={base}
        className="mb-4 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{source.title}</h1>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{t(`type.${source.sourceType}`)}</span>
        {source.sourceType === "document" ? (
          <Link
            href={`/project/${slug}/documents/${source.sourceRef}`}
            className="font-mono underline"
          >
            {source.sourceRef}
          </Link>
        ) : (
          <span className="font-mono break-all">{source.sourceRef}</span>
        )}
        <span>
          {t("lastIndexed")}{" "}
          <LocalTime iso={source.lastIndexedAt.toISOString()} className="font-mono" />
        </span>
      </p>
      {source.summary ? <p className="mt-4 text-pretty">{source.summary}</p> : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="links">
          <h2 id="links" className="mb-2 text-sm font-medium text-muted-foreground">
            {t("links")}
          </h2>
          {page.links.length === 0 ? (
            <p className="text-sm text-subtle-foreground">{t("noLinks")}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {page.links.map((l) => (
                <li key={l.targetRef}>
                  {l.targetId ? (
                    <Link href={`${base}/${l.targetId}`} className="underline">
                      {l.targetTitle ?? l.label}
                    </Link>
                  ) : (
                    <span>
                      {l.label} <span className="text-subtle-foreground">({t("unresolved")})</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="backlinks">
          <h2 id="backlinks" className="mb-2 text-sm font-medium text-muted-foreground">
            {t("backlinks")}
          </h2>
          {page.backlinks.length === 0 ? (
            <p className="text-sm text-subtle-foreground">{t("noLinks")}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {page.backlinks.map((b) => (
                <li key={b.id}>
                  <Link href={`${base}/${b.id}`} className="underline">
                    {b.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="passages" className="mt-10">
        <h2 id="passages" className="mb-3 text-sm font-medium text-muted-foreground">
          {t("outline")}
        </h2>
        <ol className="space-y-3">
          {page.chunks.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-surface p-4">
              <p className="font-mono text-xs text-muted-foreground">
                {c.heading ? `${c.heading} · ` : ""}
                {t("lines", { a: c.startLine, b: c.endLine })}
              </p>
              <p className="mt-2 text-sm whitespace-pre-line text-pretty">{c.content}</p>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
