import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { RunControls } from "@/components/agents/run-controls";
import { RunStatusChip } from "@/components/assistant/blocks/run-card";
import { Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { agentOptions } from "@/lib/agents/options";
import { getRunDetail } from "@/lib/agents/runs";
import { can } from "@/lib/auth/permissions";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("assistant.agents.run");
  return { title: t("metaTitle"), robots: { index: false } };
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

export default async function RunPage({
  params,
}: PageProps<"/[locale]/project/[slug]/agents/runs/[runId]">) {
  const { slug, runId } = await params;
  const access = await projectPageAccess(slug);
  const detail = await getRunDetail(access, runId);
  if (!detail) notFound();
  const [t, locale] = await Promise.all([getTranslations("assistant.agents.run"), getLocale()]);
  const { run, agentName, agentType, taskTitle, events } = detail;
  // Saqina's agents run simulated unless a model planned the run (recorded in the output).
  const simulated = agentType === "saqina";
  const canWrite = can(access.role, "content:write");
  const agents = canWrite ? await agentOptions(access) : [];

  const output = (run.output ?? {}) as Record<string, unknown>;
  const summary = typeof output.summary === "string" ? output.summary : null;
  const model = output.model as { label: string; fallbackUsed: boolean } | undefined;
  const handoffId = (run.metadata as { handoffId?: string | null }).handoffId ?? null;
  const issues = strings(output.issues);
  const recommendations = strings(output.recommendations);
  const artifacts = Array.isArray(output.artifacts)
    ? (output.artifacts as { title?: unknown; content?: unknown }[]).filter(
        (a) => typeof a.title === "string" && typeof a.content === "string",
      )
    : [];
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const eventLabel = (type: string, data: Record<string, unknown>) => {
    if (
      type === "AGENT_THINKING" &&
      typeof data.step === "string" &&
      t.has(`steps.${data.step}` as never)
    )
      return t(`steps.${data.step}` as never);
    return t.has(`events.${type}` as never) ? t(`events.${type}` as never) : t("events.other");
  };

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/project/${slug}/agents#runs`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden="true">← </span>
          {t("back")}
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{agentName}</h1>
          <RunStatusChip status={run.status} />
          <span className="font-mono text-xs text-subtle-foreground">#{run.attempt}</span>
        </div>
        {taskTitle && run.taskId ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("task")}:{" "}
            <Link
              href={`/project/${slug}/tasks?task=${run.taskId}`}
              className="text-foreground underline-offset-2 hover:underline"
            >
              {taskTitle}
            </Link>
          </p>
        ) : null}
      </div>

      {simulated && !output.model ? <Notice tone="info">{t("simulatedNotice")}</Notice> : null}
      {model ? (
        <p className="font-mono text-xs text-subtle-foreground">
          {t("planned", { model: model.label })}
          {model.fallbackUsed ? t("fallback") : ""}
        </p>
      ) : null}
      {handoffId ? (
        <Notice tone="info">
          {run.status === "waiting" ? `${t("external")} ` : ""}
          <Link
            href={`/project/${slug}/agents/handoffs/${handoffId}`}
            className="underline underline-offset-2"
          >
            {t("handoff")}
          </Link>
        </Notice>
      ) : null}
      {run.status === "failed" ? (
        <Notice tone="error">
          <span className="font-medium">{t("failedTitle")}: </span>
          {run.error === "execution_unavailable" ? t("execution_unavailable") : t("failedGeneric")}
        </Notice>
      ) : null}

      {canWrite ? (
        <RunControls
          slug={slug}
          runId={run.id}
          status={run.status}
          simulated={simulated}
          agents={agents}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
      )}

      <section aria-labelledby="timeline-heading">
        <h2
          id="timeline-heading"
          className="font-mono text-xs uppercase tracking-wide text-subtle-foreground"
        >
          {t("timeline")}
        </h2>
        {events.length ? (
          <ol className="mt-3 space-y-0 border-l border-border pl-4">
            {events.map((event) => (
              <li key={event.id} className="relative py-1.5">
                <span
                  aria-hidden="true"
                  className="absolute top-3 -left-[1.3rem] size-2 rounded-full bg-border-strong"
                />
                <time
                  dateTime={event.createdAt.toISOString()}
                  className="mr-3 font-mono text-xs text-subtle-foreground"
                >
                  {time.format(event.createdAt)}
                </time>
                <span className="text-sm">{eventLabel(event.type, event.data)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{t("noEvents")}</p>
        )}
      </section>

      <section aria-labelledby="result-heading" className="space-y-4">
        <h2
          id="result-heading"
          className="font-mono text-xs uppercase tracking-wide text-subtle-foreground"
        >
          {t("result")}
        </h2>
        {summary ? (
          <>
            {output.simulated === true ? (
              <p className="text-xs text-subtle-foreground">{t("simulatedResult")}</p>
            ) : null}
            <div>
              <h3 className="text-sm font-medium">{t("summary")}</h3>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">{summary}</p>
            </div>
            {issues.length ? (
              <div>
                <h3 className="text-sm font-medium">{t("issues")}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {recommendations.length ? (
              <div>
                <h3 className="text-sm font-medium">{t("recommendations")}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {recommendations.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {artifacts.length ? (
              <div>
                <h3 className="text-sm font-medium">{t("artifacts")}</h3>
                {artifacts.map((a) => (
                  <div
                    key={String(a.title)}
                    className="mt-2 rounded-md border border-border bg-surface p-3"
                  >
                    <p className="text-sm font-medium">{String(a.title)}</p>
                    <pre className="mt-1 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                      {String(a.content)}
                    </pre>
                  </div>
                ))}
              </div>
            ) : null}
            {run.proposalId ? (
              <Link
                href={`/project/${slug}/approvals`}
                className="inline-block text-sm text-primary underline-offset-2 hover:underline"
              >
                {t("proposal")}
              </Link>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noResult")}</p>
        )}
      </section>
    </div>
  );
}
