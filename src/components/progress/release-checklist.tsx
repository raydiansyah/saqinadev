"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { answerDeliveryAction } from "@/app/[locale]/(app)/project/[slug]/progress/release-actions";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import type { DeliveryNote, TaskCounts } from "@/lib/delivery/consistency";
import { DELIVERY_STEPS, type DeliveryStep } from "@/lib/domain/delivery";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ReleaseCheck {
  step: DeliveryStep;
  unanswered: boolean;
  done: boolean;
  answeredBy: string | null;
  answeredAt: string | null;
  stale: boolean;
}

/**
 * Three questions for the team: is it built, reviewed, deployed? Each answer carries who gave it
 * and when, and is flagged when tasks or milestones changed afterwards, so nobody reads an old
 * "yes" as the current state.
 */
export function ReleaseChecklist({
  slug,
  checks,
  tasks,
  notes,
  canAnswer,
}: {
  slug: string;
  checks: ReleaseCheck[];
  tasks: TaskCounts;
  notes: DeliveryNote[];
  canAnswer: boolean;
}) {
  const t = useTranslations("progress.release");
  const errors = useTranslations("app.errors");
  const locale = useLocale();
  const id = useId();
  const { pending, error, run } = useRun();
  const byStep = new Map(checks.map((c) => [c.step, c]));
  const current = DELIVERY_STEPS.map((s) => byStep.get(s)).filter(
    (c): c is ReleaseCheck => c !== undefined,
  );
  const allDone = current.length === DELIVERY_STEPS.length && current.every((c) => c.done);
  const anyStale = current.some((c) => c.stale);

  return (
    <section aria-labelledby={`${id}-h`} className="rounded-lg border border-border p-5">
      <h2 id={`${id}-h`} className="font-semibold">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>

      {tasks.total > 0 ? (
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          {t("tasks", { done: tasks.done, total: tasks.total })}
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-border">
        {DELIVERY_STEPS.map((step) => {
          const c = byStep.get(step);
          return (
            <li key={step} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t(`${step}.question`)}</p>
                <p
                  className={cn(
                    "mt-0.5 text-xs",
                    c?.stale ? "text-warning" : "text-muted-foreground",
                  )}
                >
                  {!c || c.unanswered
                    ? t("unanswered")
                    : [
                        c.done ? t("yes") : t("no"),
                        c.answeredBy ? t("by", { name: c.answeredBy }) : null,
                        c.answeredAt ? formatRelative(new Date(c.answeredAt), locale) : null,
                        c.stale ? t("stale") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </p>
                {notes
                  .filter((n) => n.step === step)
                  .map((n) => (
                    <p key={n.code} className="mt-1 text-xs text-warning">
                      {t(`notes.${n.code}`, { count: "count" in n ? n.count : 0 })}
                    </p>
                  ))}
              </div>
              {canAnswer ? (
                <div role="group" aria-label={t(`${step}.question`)} className="flex gap-2">
                  {([true, false] as const).map((value) => (
                    <Button
                      key={String(value)}
                      size="sm"
                      variant={c && !c.unanswered && c.done === value ? "primary" : "outline"}
                      aria-pressed={c && !c.unanswered ? c.done === value : false}
                      disabled={pending}
                      onClick={() => run(() => answerDeliveryAction(slug, step, value))}
                    >
                      {value ? t("answerYes") : t("answerNo")}
                    </Button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div aria-live="polite" className="mt-3 text-sm">
        {allDone && !anyStale ? (
          <p className="text-success">{t("allCurrent")}</p>
        ) : anyStale ? (
          <p className="text-warning">{t("confirmAgain")}</p>
        ) : (
          <p className="text-muted-foreground">{t("notYet")}</p>
        )}
      </div>
      {error ? <Notice tone="error">{errors(error.code as "INTERNAL_ERROR")}</Notice> : null}
    </section>
  );
}
