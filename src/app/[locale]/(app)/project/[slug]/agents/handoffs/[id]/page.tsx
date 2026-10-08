import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { HandoffActions } from "@/components/integrations/handoff-view";
import { Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { agentResult } from "@/lib/agents/external/result";
import { getHandoff } from "@/lib/agents/handoff";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { agents, tasks } from "@/lib/db/schema";
import { formatRelative } from "@/lib/format";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("integrations");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** What was handed to an external agent, from which project version, and what came back. */
export default async function HandoffPage({
  params,
}: PageProps<"/[locale]/project/[slug]/agents/handoffs/[id]">) {
  const { slug, id } = await params;
  const access = await projectPageAccess(slug);
  const row = await getHandoff(access, id);
  if (!row) notFound();
  const [[agent], [task], t, locale] = await Promise.all([
    db.select({ name: agents.name }).from(agents).where(eq(agents.id, row.agentId)),
    row.taskId
      ? db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, row.taskId))
      : Promise.resolve([]),
    getTranslations("integrations.handoff"),
    getLocale(),
  ]);
  const current = access.project.contextRevision;
  const result = row.result ? agentResult.safeParse(row.result) : null;

  return (
    <div className="space-y-6">
      <Link
        href={`/project/${slug}/integrations`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        <span aria-hidden="true">← </span>
        {t("back")}
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{t("title", { agent: agent?.name ?? "" })}</h1>
        {task ? <p className="mt-1 text-sm text-muted-foreground">{task.title}</p> : null}
        <p className="mt-1 font-mono text-xs text-subtle-foreground">
          {t(`statuses.${row.status}`)} · {t("version", { version: row.contextVersion })} ·{" "}
          {t("meta", {
            time: formatRelative(row.createdAt, locale),
            revision: row.sourceRevision?.slice(0, 10) ?? "-",
          })}
        </p>
      </div>
      <Notice tone="info">{t("notReal")}</Notice>
      {current > row.contextVersion ? (
        <Notice tone="warning">{t("stale", { current })}</Notice>
      ) : null}

      <HandoffActions
        slug={slug}
        handoffId={row.id}
        status={row.status}
        pkg={row.package}
        fileName={`saqina-${slug}-v${row.contextVersion}.md`}
        canWrite={can(access.role, "content:write")}
      />

      <section aria-labelledby="files-heading">
        <h2
          id="files-heading"
          className="font-mono text-xs uppercase tracking-wide text-subtle-foreground"
        >
          {t("files")}
        </h2>
        <p className="mt-1 font-mono text-sm">{row.files.join(", ")}</p>
        <details className="mt-3 rounded-md border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm">{t("preview")}</summary>
          <pre className="max-h-96 overflow-auto border-t border-border p-3 font-mono text-xs whitespace-pre-wrap">
            {row.package}
          </pre>
        </details>
      </section>

      <section aria-labelledby="result-heading" className="rounded-lg border border-border p-5">
        <h2 id="result-heading" className="font-semibold">
          {t("resultTitle")}
        </h2>
        {result?.success ? (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-pretty">
              <span className="font-medium">{t("summary")}: </span>
              {result.data.summary}
            </p>
            {(["changes", "issues", "suggestions"] as const).map((k) =>
              result.data[k].length ? (
                <div key={k}>
                  <p className="font-medium">{t(k)}</p>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {result.data[k].map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{t("noResult")}</p>
        )}
      </section>
    </div>
  );
}
