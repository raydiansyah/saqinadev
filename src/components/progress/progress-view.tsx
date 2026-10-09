import { useTranslations } from "next-intl";
import type { ClientProgress } from "@/lib/portal/progress";
import { cn } from "@/lib/utils";

const MARK = { done: "✓", current: "●", upcoming: "○" } as const;

/** The client-facing progress summary: a percent bar and the visible stages. */
export function ProgressView({ progress }: { progress: ClientProgress }) {
  const t = useTranslations("progress");
  return (
    <section aria-labelledby="progress-summary" className="rounded-lg border border-border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="progress-summary" className="font-semibold">
          {t("percentLabel")}
        </h2>
        <span className="font-mono text-sm">{t("percent", { percent: progress.percent })}</span>
      </div>
      <div
        role="progressbar"
        aria-labelledby="progress-summary"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        className="mt-3 h-2 overflow-hidden rounded-full bg-surface-raised"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }} />
      </div>
      {progress.current || progress.next ? (
        <p className="mt-3 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
          {progress.current ? <span>{t("current", { stage: progress.current })}</span> : null}
          {progress.next ? <span>{t("next", { stage: progress.next })}</span> : null}
        </p>
      ) : null}

      <h3 className="mt-6 text-sm font-medium">{t("stages")}</h3>
      {progress.stages.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {progress.stages.map((stage, i) => (
            <li
              // Stage titles may repeat, so the index keeps keys unique.
              // biome-ignore lint/suspicious/noArrayIndexKey: list is static per render
              key={i}
              className="flex items-center gap-3 text-sm"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs",
                  stage.state === "done" && "border-success/50 text-success",
                  stage.state === "current" && "border-primary text-primary",
                  stage.state === "upcoming" && "border-border text-subtle-foreground",
                )}
              >
                {MARK[stage.state]}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 break-words",
                  stage.state === "upcoming" && "text-muted-foreground",
                  stage.state === "current" && "font-medium",
                )}
              >
                {stage.title}
              </span>
              <span className="font-mono text-xs text-subtle-foreground">
                {t(`states.${stage.state}`)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
