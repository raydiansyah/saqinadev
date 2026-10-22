import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { CodeReindexButton } from "@/components/memory/code-reindex-button";
import { MemoryTabs } from "@/components/memory/memory-tabs";
import { LocalTime } from "@/components/primitives/local-time";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { principalOf } from "@/lib/memory/access";
import { callersOf, findSymbols, impactOf, listRevisions } from "@/lib/memory/code/queries";
import { getOverview } from "@/lib/memory/queries";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("memoryHub.code");
  return { title: t("title"), robots: { index: false } };
}

const one = (v: string | string[] | undefined, max = 300) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CodePage({
  params,
  searchParams,
}: PageProps<"/[locale]/project/[slug]/memory/code">) {
  const { slug } = await params;
  const query = await searchParams;
  const q = one(query.q, 100);
  const file = one(query.file);
  const symbol = one(query.symbol, 64);
  const access = await projectPageAccess(slug);
  const principal = principalOf(access);
  const admin = access.role === "owner" || access.role === "admin";
  const projectId = access.project.id;

  const [revisions, overview, found, impact, callers, t] = await Promise.all([
    listRevisions(principal, projectId),
    getOverview(access),
    q ? findSymbols(principal, projectId, { query: q }) : null,
    file ? impactOf(principal, projectId, { path: file }) : null,
    UUID.test(symbol) ? callersOf(principal, projectId, { symbolId: symbol }) : null,
    getTranslations("memoryHub.code"),
  ]);
  const base = `/project/${slug}/memory/code`;

  return (
    <>
      <PageHeading
        title={t("title")}
        description={t("description")}
        actions={admin ? <CodeReindexButton slug={slug} /> : null}
      />
      <MemoryTabs slug={slug} active="code" pending={overview.pendingReview} admin={admin} />
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">{t("note")}</p>

      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t("revisions")}</h2>
      {revisions.length === 0 ? (
        <EmptyState title={t("empty")} body={t("emptyBody")} />
      ) : (
        <ul className="mb-8 divide-y divide-border rounded-lg border border-border bg-surface">
          {revisions.map((r) => (
            <li key={r.indexId} className="p-4 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-muted-foreground">{r.repository}</span>
                <span className="font-medium">{r.branch}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {t("commit", { sha: r.commitSha.slice(0, 8) })}
                </span>
                <span className="rounded-md border border-border-strong px-2 py-0.5 font-mono text-xs">
                  {t(`status.${r.status}`)}
                </span>
              </div>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle-foreground">
                <span>{t("files", { n: r.fileCount })}</span>
                <span>{t("symbols", { n: r.symbolCount })}</span>
                <span className="font-mono">{r.parser}</span>
                {r.indexedAt ? (
                  <span>
                    {t("readAt")}{" "}
                    <LocalTime iso={r.indexedAt.toISOString()} className="font-mono" />
                  </span>
                ) : null}
                {r.pendingFiles > 0 ? <span>{t("pending", { n: r.pendingFiles })}</span> : null}
                {r.failedFiles > 0 ? (
                  <span className="text-error">{t("failedFiles", { n: r.failedFiles })}</span>
                ) : null}
                {r.stale ? <span className="text-warning">{t("stale")}</span> : null}
                {r.errorCode === "file_limit" ? (
                  <span className="text-warning">{t("partial")}</span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}

      {revisions.length > 0 ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="symbols">
            <h2 id="symbols" className="mb-3 text-sm font-medium text-muted-foreground">
              {t("search")}
            </h2>
            <form
              action={base}
              method="get"
              role="search"
              className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <div className="sm:w-72">
                <Field
                  id="code-q"
                  name="q"
                  label={t("search")}
                  placeholder={t("searchPlaceholder")}
                  defaultValue={q}
                  maxLength={100}
                />
              </div>
              <Button type="submit">{t("searchSubmit")}</Button>
            </form>
            {found ? (
              found.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noResults")}</p>
              ) : (
                <ul className="space-y-2">
                  {found.items.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-lg border border-border bg-surface p-3 text-sm"
                    >
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">
                          {s.container ? `${s.container}.${s.name}` : s.name}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">{s.kind}</span>
                        {s.exported ? (
                          <span className="font-mono text-xs text-subtle-foreground">
                            {t("exported")}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
                        {s.path} · {t("lines", { a: s.startLine, b: s.endLine })}
                      </p>
                      <p className="mt-2 flex flex-wrap gap-x-4 text-xs">
                        <Link href={`${base}?symbol=${s.id}`} className="underline">
                          {t("viewCallers")} ({t("callersCount", { n: s.resolvedCallers })})
                        </Link>
                        <Link
                          href={`${base}?file=${encodeURIComponent(s.path)}`}
                          className="underline"
                        >
                          {t("viewImpact")}
                        </Link>
                      </p>
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {callers?.symbol ? (
              <div className="mt-6" aria-live="polite">
                <h3 className="mb-2 text-sm font-medium">
                  {t("callers")}: <span className="font-mono">{callers.symbol.name}</span>
                </h3>
                {callers.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noCallers")}</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {callers.items.map((c) => (
                      <li
                        key={`${c.path}:${c.line}:${c.caller}`}
                        className="flex flex-wrap gap-x-3"
                      >
                        <span className="font-mono text-xs break-all">
                          {c.path}:{c.line}
                        </span>
                        {c.caller ? (
                          <span className="text-muted-foreground">{c.caller}</span>
                        ) : null}
                        <span
                          className={
                            c.resolution === "resolved"
                              ? "text-xs text-success"
                              : "text-xs text-warning"
                          }
                        >
                          {c.resolution === "resolved" ? t("resolved") : t("nameOnly")}
                        </span>
                        {c.isTest ? (
                          <span className="text-xs text-subtle-foreground">{t("inTest")}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </section>

          <section aria-labelledby="impact">
            <h2 id="impact" className="mb-3 text-sm font-medium text-muted-foreground">
              {t("impact")}
            </h2>
            <form
              action={base}
              method="get"
              role="search"
              className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <div className="sm:w-72">
                <Field
                  id="code-file"
                  name="file"
                  label={t("impact")}
                  placeholder={t("impactPlaceholder")}
                  defaultValue={file}
                  maxLength={300}
                />
              </div>
              <Button type="submit">{t("impactSubmit")}</Button>
            </form>
            {impact ? (
              !impact.file ? (
                <p className="text-sm text-muted-foreground">{t("unknownFile")}</p>
              ) : (
                <div className="space-y-4 text-sm" aria-live="polite">
                  <p className="font-mono text-xs break-all text-muted-foreground">
                    {impact.file.path}
                  </p>
                  <div>
                    <h3 className="mb-1 font-medium">{t("exports")}</h3>
                    <p className="text-muted-foreground">
                      {impact.file.exports.length
                        ? impact.file.exports.map((e) => e.name).join(", ")
                        : t("none")}
                    </p>
                  </div>
                  {impact.truncated ? <p className="text-warning">{t("truncated")}</p> : null}
                  {(
                    [
                      ["dependents", impact.dependents],
                      ["tests", impact.tests],
                    ] as const
                  ).map(([key, list]) => (
                    <div key={key}>
                      <h3 className="mb-1 font-medium">{t(key)}</h3>
                      {list.length === 0 ? (
                        <p className="text-muted-foreground">{t("none")}</p>
                      ) : (
                        <ul className="space-y-1">
                          {list.map((d) => (
                            <li key={d.path} className="flex flex-wrap gap-x-3">
                              <Link
                                href={`${base}?file=${encodeURIComponent(d.path)}`}
                                className="font-mono text-xs break-all underline"
                              >
                                {d.path}
                              </Link>
                              <span className="text-xs text-subtle-foreground">
                                {t("level", { n: d.depth })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
