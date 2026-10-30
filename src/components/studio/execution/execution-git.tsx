"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useExecutionContext } from "./context";
import { parseReason } from "./reasons";

const CI_TONE = (status: string, conclusion: string | null) =>
  status !== "completed"
    ? "text-info border-info/40"
    : conclusion === "success"
      ? "text-success border-success/40"
      : conclusion === "skipped" || conclusion === "neutral"
        ? "text-muted-foreground border-border"
        : "text-error border-error/40";

/**
 * The state of the work branch in the repository: where it is, which commits it holds, how CI is
 * doing and whether a git operation failed. Each line is what the host or Saqina's audit says; a
 * push or a commit is only reported once the host has answered it.
 */
export function ExecutionGit() {
  const t = useTranslations("studio.execution");
  const locale = useLocale();
  const { active, diff, delivery, want } = useExecutionContext();
  useEffect(() => {
    want("diff");
    want("delivery");
  }, [want]);
  const execution = active.state.execution;
  if (!execution) return null;
  const d = diff.data;
  const del = delivery.data;
  const failures = execution.tasks.filter(
    (x) => x.blockedReason?.startsWith("git_") || x.blockedReason === "repository_not_connected",
  );

  return (
    <section aria-labelledby="exec-git-title" className="mb-6 space-y-3">
      <h3
        id="exec-git-title"
        className="font-mono text-xs uppercase tracking-wider text-subtle-foreground"
      >
        {t("git.title")}
      </h3>
      {!execution.branch ? (
        <p className="text-sm text-muted-foreground">{t("git.noBranch")}</p>
      ) : null}
      {execution.branch ? (
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-muted-foreground">{t("git.branch")}</dt>
          <dd className="font-mono text-xs">{execution.branch}</dd>
          {d?.base ? (
            <>
              <dt className="text-muted-foreground">{t("git.base")}</dt>
              <dd className="font-mono text-xs">{d.base}</dd>
            </>
          ) : null}
          {del?.repository ? (
            <>
              <dt className="text-muted-foreground">{t("git.repository")}</dt>
              <dd className="break-all font-mono text-xs">{del.repository.fullName}</dd>
              <dt className="text-muted-foreground">{t("git.remote")}</dt>
              <dd className="text-xs">
                {d?.status === "ok" && d.aheadBy > 0
                  ? del.repository.provider === "custom_local"
                    ? t("git.localOnly")
                    : t("git.onRemote", { n: d.aheadBy })
                  : t("git.notConfirmed")}
              </dd>
            </>
          ) : null}
          {del?.lastCommit ? (
            <>
              <dt className="text-muted-foreground">{t("git.lastCommit")}</dt>
              <dd className="text-xs">
                <span className="font-mono">{del.lastCommit.sha.slice(0, 7)}</span> ·{" "}
                {formatRelative(new Date(del.lastCommit.at), locale)}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {failures.length > 0 ? (
        <ul className="space-y-1">
          {failures.map((f) => {
            const reason = parseReason(f.blockedReason);
            return (
              <li key={f.id} className="rounded-md border border-error/40 p-2 text-xs">
                <span className="font-medium">{f.title}: </span>
                {reason && t.has(`reasons.${reason.key}` as never)
                  ? t(`reasons.${reason.key}` as never, reason.values as never)
                  : f.blockedReason}
              </li>
            );
          })}
        </ul>
      ) : null}

      {d?.status === "ok" && d.commits.length > 0 ? (
        <div>
          <h4 className="mb-1 text-xs text-muted-foreground">{t("git.commits")}</h4>
          <ul className="space-y-0.5 text-xs">
            {d.commits.map((c) => (
              <li key={c.sha}>
                <span className="font-mono">{c.sha.slice(0, 7)}</span> {c.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h4 className="mb-1 text-xs text-muted-foreground">{t("git.ci")}</h4>
        {!del || del.ci.runs.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("git.noCi")}</p>
        ) : (
          <ul className="space-y-1">
            {del.ci.runs.map((r) => (
              <li
                key={`${r.name}-${r.updatedAt}`}
                className="flex flex-wrap items-center gap-2 text-xs"
              >
                <span
                  className={cn(
                    "rounded-sm border px-1.5 py-0.5 font-mono",
                    CI_TONE(r.status, r.conclusion),
                  )}
                >
                  {r.status === "completed" ? (r.conclusion ?? "done") : r.status}
                </span>
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline underline-offset-2"
                  >
                    {r.name}
                  </a>
                ) : (
                  <span>{r.name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
