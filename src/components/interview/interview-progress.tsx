"use client";

import { useTranslations } from "next-intl";
import { STEP_GROUP, STEP_GROUPS, type StepGroup, type StepId } from "@/lib/interview/types";
import { cn } from "@/lib/utils";

interface InterviewProgressProps {
  step: StepId;
  visible: StepId[];
  /** Translated group names. */
  groups: Record<StepGroup, string>;
}

/** Groups of the interview. Groups with no relevant steps are left out. */
export function InterviewProgress({ step, visible, groups: names }: InterviewProgressProps) {
  const t = useTranslations("interview.progress");
  const groups = STEP_GROUPS.filter((g) => visible.some((s) => STEP_GROUP[s] === g));
  const current = groups.indexOf(STEP_GROUP[step]);

  return (
    <nav aria-label={t("label")}>
      <p className="text-sm text-muted-foreground sm:hidden">
        {t("part", { current: current + 1, total: groups.length })} ·{" "}
        <span className="text-foreground">{names[groups[current]]}</span>
      </p>
      <div aria-hidden="true" className="mt-2 h-0.5 rounded-full bg-border sm:hidden">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${((current + 1) / groups.length) * 100}%` }}
        />
      </div>
      <ol className="hidden gap-x-5 gap-y-2 sm:flex sm:flex-wrap">
        {groups.map((group, i) => (
          <li
            key={group}
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 font-mono text-[0.8125rem]",
              i === current
                ? "text-foreground"
                : i < current
                  ? "text-primary"
                  : "text-subtle-foreground",
            )}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            <span className="font-sans">{names[group]}</span>
            {i < current ? <span className="sr-only">{t("done")}</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
