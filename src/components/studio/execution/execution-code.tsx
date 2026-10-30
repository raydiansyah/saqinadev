"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatRelative } from "@/lib/format";
import { useExecutionContext } from "./context";

/**
 * What the agents changed, read from the stored artifacts of the active execution. A file is listed
 * only after its commit exists; until then the tab says there is no code change.
 */
export function ExecutionCode() {
  const t = useTranslations("studio.execution");
  const locale = useLocale();
  const { active } = useExecutionContext();
  const execution = active.state.execution;
  if (!execution) return null;

  const title = (id: string | null) => execution.tasks.find((x) => x.id === id)?.title ?? "";
  const files = execution.artifacts.filter((a) => a.kind === "file_change");
  const commits = execution.artifacts.filter((a) => a.kind === "commit");

  return (
    <section aria-labelledby="exec-code-title" className="mb-6 space-y-3">
      <h3
        id="exec-code-title"
        className="font-mono text-xs uppercase tracking-wider text-subtle-foreground"
      >
        {t("codeChanges")}
      </h3>
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noCodeYet")}</p>
      ) : (
        <>
          {execution.branch ? (
            <p className="text-xs text-muted-foreground">
              {t("onBranch")} <span className="font-mono text-foreground">{execution.branch}</span>
            </p>
          ) : null}
          <ul className="divide-y divide-border rounded-md border border-border">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.path}</span>
                <span className="text-xs text-muted-foreground">{title(f.taskId)}</span>
                <span className="font-mono text-xs text-subtle-foreground">
                  {formatRelative(new Date(f.createdAt), locale)}
                </span>
              </li>
            ))}
          </ul>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {commits.map((c) => (
              <li key={c.id}>
                <span className="font-mono text-foreground">{(c.commitSha ?? "").slice(0, 7)}</span>{" "}
                {c.summary} · {title(c.taskId)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
