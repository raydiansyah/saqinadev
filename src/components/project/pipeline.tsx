import { getTranslations } from "next-intl/server";
import { PIPELINE, type PipelineStage, type StageState } from "@/lib/projects/progress";
import { cn } from "@/lib/utils";

/**
 * IDEA → … → DEPLOY as a functional progress list. State is carried by text and shape, not
 * colour alone: a check for done, a filled dot for current, a ring for not started.
 */
export async function Pipeline({
  stages,
  compact = false,
}: {
  stages: Record<PipelineStage, StageState>;
  compact?: boolean;
}) {
  const t = await getTranslations("project.pipeline");
  return (
    <ol
      aria-label={t("label")}
      className={cn("flex", compact ? "gap-1.5" : "flex-wrap gap-x-1 gap-y-2")}
    >
      {PIPELINE.map((stage, i) => {
        const state = stages[stage];
        return (
          <li
            key={stage}
            aria-current={state === "current" ? "step" : undefined}
            className="flex items-center gap-1"
          >
            {i > 0 && !compact ? (
              <span aria-hidden="true" className="h-px w-3 bg-border-strong sm:w-5" />
            ) : null}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                state === "done" && "border-success/40 text-success",
                state === "current" && "border-primary bg-primary/10 text-foreground",
                state === "upcoming" && "border-border text-subtle-foreground",
                compact && "px-1.5",
              )}
            >
              <span aria-hidden="true" className="font-mono">
                {state === "done" ? "✓" : state === "current" ? "●" : "○"}
              </span>
              <span className={cn(compact && "sr-only")}>{t(stage)}</span>
              <span className="sr-only">({t(state)})</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
