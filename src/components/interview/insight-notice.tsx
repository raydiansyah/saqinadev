"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Answers, Insight } from "@/lib/interview/types";
import { cn } from "@/lib/utils";

interface InsightNoticeProps {
  insight: Insight;
  answers: Answers;
  onApply: (answers: Answers) => void;
}

/** A contradiction or suggestion from the engine. The user decides; nothing is applied silently. */
export function InsightNotice({ insight, answers, onApply }: InsightNoticeProps) {
  const t = useTranslations("interview.insight");
  return (
    <div
      className={cn(
        "rounded-md border bg-surface p-4 sm:p-5",
        insight.severity === "warning" ? "border-warning/50" : "border-info/50",
      )}
    >
      <p
        className={cn(
          "font-mono text-xs",
          insight.severity === "warning" ? "text-warning" : "text-info",
        )}
      >
        {t(insight.severity)}
      </p>
      <p className="mt-1.5 font-medium">{insight.title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{insight.message}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {insight.actions.map((action, i) => (
          <Button
            key={action.label}
            size="sm"
            variant={i === 0 ? "outline" : "ghost"}
            onClick={() => onApply(action.apply(answers))}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

interface InsightListProps {
  insights: Insight[];
  answers: Answers;
  onApply: (answers: Answers) => void;
}

export function InsightList({ insights, answers, onApply }: InsightListProps) {
  // The live region stays mounted so new insights are announced when they appear.
  return (
    <div aria-live="polite" className="space-y-3 empty:hidden">
      {insights.map((insight) => (
        <InsightNotice key={insight.id} insight={insight} answers={answers} onApply={onApply} />
      ))}
    </div>
  );
}
