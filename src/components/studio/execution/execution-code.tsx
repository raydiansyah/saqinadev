"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { useExecutionContext } from "./context";
import { DiffView } from "./diff-view";

const STATUS_SIGN = { added: "A", modified: "M", removed: "D", renamed: "R" } as const;

/**
 * What the agents changed, as the repository host reports it for the work branch: files, lines and
 * the diff itself. Nothing here is assembled by Saqina. If the repository cannot say, this says why
 * instead of listing files the agents only claim to have written.
 */
export function ExecutionCode() {
  const t = useTranslations("studio.execution");
  const locale = useLocale();
  const { active, diff, want } = useExecutionContext();
  useEffect(() => want("diff"), [want]);
  const execution = active.state.execution;
  if (!execution) return null;

  const title = (id: string | null) => execution.tasks.find((x) => x.id === id)?.title ?? "";
  const claimed = execution.artifacts.filter((a) => a.kind === "file_change");
  const d = diff.data;
  const added = d?.files.reduce((n, f) => n + f.additions, 0) ?? 0;
  const removed = d?.files.reduce((n, f) => n + f.deletions, 0) ?? 0;

  return (
    <section aria-labelledby="exec-code-title" className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3
          id="exec-code-title"
          className="font-mono text-xs uppercase tracking-wider text-subtle-foreground"
        >
          {t("codeChanges")}
        </h3>
        {diff.loading && d ? (
          <span role="status" className="text-xs text-muted-foreground">
            {t("diff.refreshing")}
          </span>
        ) : null}
      </div>

      {!d && diff.loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("diff.reading")}
        </p>
      ) : null}
      {diff.error ? (
        <div className="space-y-2 rounded-md border border-error/40 p-3 text-sm">
          <p>{t("diff.failed")}</p>
          <Button size="sm" variant="outline" onClick={diff.refetch}>
            {t("tryAgain")}
          </Button>
        </div>
      ) : null}

      {d?.status === "no_repository" ? (
        <p className="text-sm text-muted-foreground">{t("diff.noRepository")}</p>
      ) : null}
      {d?.status === "unsupported" ? (
        <p className="text-sm text-muted-foreground">{t("diff.unsupported")}</p>
      ) : null}
      {d?.status === "error" ? (
        <div className="space-y-2 rounded-md border border-warning/40 p-3 text-sm">
          <p>{t("diff.hostError", { code: d.code ?? "" })}</p>
          <Button size="sm" variant="outline" onClick={diff.refetch}>
            {t("tryAgain")}
          </Button>
        </div>
      ) : null}

      {d && (d.status === "no_branch" || (d.status === "ok" && d.files.length === 0)) ? (
        <p className="text-sm text-muted-foreground">{t("noCodeYet")}</p>
      ) : null}

      {d?.status === "ok" && d.files.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">
            {t("diff.summary", { files: d.files.length, commits: d.aheadBy })}{" "}
            <span className="font-mono text-success">+{added}</span>{" "}
            <span className="font-mono text-error">−{removed}</span> · {t("onBranch")}{" "}
            <span className="font-mono text-foreground">{d.head}</span> ({t("diff.against")}{" "}
            <span className="font-mono">{d.base}</span>)
          </p>
          <ul className="space-y-2">
            {d.files.map((f) => {
              const made = claimed.find((c) => c.path === f.path);
              return (
                <li key={f.path} className="rounded-md border border-border">
                  <details>
                    <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                      <span
                        aria-hidden="true"
                        className="w-4 font-mono text-xs text-subtle-foreground"
                      >
                        {STATUS_SIGN[f.status]}
                      </span>
                      <span className="sr-only">{t(`diff.status.${f.status}`)}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.path}</span>
                      <span className="font-mono text-xs text-success">+{f.additions}</span>
                      <span className="font-mono text-xs text-error">−{f.deletions}</span>
                      {made ? (
                        <span className="text-xs text-muted-foreground">
                          {title(made.taskId)} · {formatRelative(new Date(made.createdAt), locale)}
                        </span>
                      ) : null}
                    </summary>
                    <div className="border-t border-border p-2">
                      {f.patch ? (
                        <DiffView patch={f.patch} />
                      ) : (
                        <p className="p-1 text-xs text-muted-foreground">{t("diff.noPatch")}</p>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
          {d.truncated ? (
            <p className="text-xs text-muted-foreground">{t("diff.truncated")}</p>
          ) : null}
        </>
      ) : null}

      {/* The agents' own list, only where the repository could not confirm it: said as such. */}
      {d && d.status !== "ok" && claimed.length > 0 ? (
        <div>
          <p className="text-xs text-muted-foreground">{t("diff.claimed")}</p>
          <ul className="mt-1 list-disc pl-4 font-mono text-xs">
            {claimed.map((c) => (
              <li key={c.id}>{c.path}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
