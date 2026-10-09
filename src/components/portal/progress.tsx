import { getTranslations } from "next-intl/server";
import type { ClientProgress } from "@/lib/portal/progress";
import type { ClientStageKey } from "@/lib/portal/views";
import { cn } from "@/lib/utils";

export async function ProgressBar({ percent }: { percent: number }) {
  const t = await getTranslations("portal.progress");
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{t("label")}</span>
        <span className="font-mono">{t("percent", { percent: value })}</span>
      </div>
      <div
        role="progressbar"
        aria-label={t("label")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-raised"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export async function StageBadge({ stage }: { stage: ClientStageKey }) {
  const t = await getTranslations("portal.stage");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs",
        stage === "completed"
          ? "border-success/40 text-success"
          : stage === "paused"
            ? "border-warning/40 text-warning"
            : "border-border-strong text-muted-foreground",
      )}
    >
      {t(stage)}
    </span>
  );
}

/** Current and next stage, side by side. */
export async function StagePointers({ progress }: { progress: ClientProgress }) {
  const t = await getTranslations("portal.progress");
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div className="min-w-0">
        <dt className="text-muted-foreground">{t("current")}</dt>
        <dd className="mt-0.5 truncate font-medium">{progress.current ?? t("none")}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-muted-foreground">{t("next")}</dt>
        <dd className="mt-0.5 truncate font-medium">{progress.next ?? t("none")}</dd>
      </div>
    </dl>
  );
}

const MARK = { done: "✓", current: "●", upcoming: "○" } as const;

export async function StageList({ stages }: { stages: ClientProgress["stages"] }) {
  const t = await getTranslations("portal.progress");
  return (
    <ol aria-label={t("listLabel")} className="space-y-2">
      {stages.map((stage, i) => (
        <li
          // Stage titles may repeat; position keeps keys unique.
          // biome-ignore lint/suspicious/noArrayIndexKey: list is static per render
          key={i}
          className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3",
            stage.state === "current" ? "border-primary/50 bg-surface" : "border-border",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs",
              stage.state === "done" && "bg-success/15 text-success",
              stage.state === "current" && "bg-primary/15 text-primary",
              stage.state === "upcoming" && "text-subtle-foreground",
            )}
          >
            {MARK[stage.state]}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 break-words",
              stage.state === "upcoming" && "text-muted-foreground",
            )}
          >
            {stage.title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t(`state.${stage.state}`)}
          </span>
        </li>
      ))}
    </ol>
  );
}
