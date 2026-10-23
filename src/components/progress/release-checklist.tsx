"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { answerDeliveryAction } from "@/app/[locale]/(app)/project/[slug]/progress/release-actions";
import { Dialog } from "@/components/app/dialog";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import {
  type Answers,
  type DeliveryNote,
  planTaskAdjustment,
  settleAnswers,
  type TaskAdjustment,
  type TaskCounts,
} from "@/lib/delivery/consistency";
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
  awaiting,
  canAnswer,
}: {
  slug: string;
  checks: ReleaseCheck[];
  tasks: TaskCounts;
  notes: DeliveryNote[];
  /** Imported from GitHub and nobody has answered yet: this is the first thing to do. */
  awaiting: boolean;
  canAnswer: boolean;
}) {
  const t = useTranslations("progress.release");
  const errors = useTranslations("app.errors");
  const locale = useLocale();
  const id = useId();
  const { pending, error, run } = useRun();
  // An answer that would move tasks waits here until the person chooses what to do.
  const [ask, setAsk] = useState<{
    step: DeliveryStep;
    value: boolean;
    moves: TaskAdjustment;
  } | null>(null);
  const answers: Answers = { build: null, review: null, deploy: null };
  for (const c of checks) answers[c.step] = c.unanswered ? null : c.done;

  function answer(step: DeliveryStep, value: boolean) {
    const moves = planTaskAdjustment(settleAnswers(answers, step, value), tasks);
    if (moves.toReview + moves.toDone > 0) return setAsk({ step, value, moves });
    run(() => answerDeliveryAction(slug, step, value, false));
  }

  function confirm(adjustTasks: boolean) {
    if (!ask) return;
    const { step, value } = ask;
    setAsk(null);
    run(() => answerDeliveryAction(slug, step, value, adjustTasks));
  }
  const byStep = new Map(checks.map((c) => [c.step, c]));
  const current = DELIVERY_STEPS.map((s) => byStep.get(s)).filter(
    (c): c is ReleaseCheck => c !== undefined,
  );
  const allDone = current.length === DELIVERY_STEPS.length && current.every((c) => c.done);
  const anyStale = current.some((c) => c.stale);

  return (
    <section
      aria-labelledby={`${id}-h`}
      className={cn("rounded-lg border p-5", awaiting ? "border-primary" : "border-border")}
    >
      <h2 id={`${id}-h`} className="font-semibold">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      {awaiting ? (
        <p role="status" className="mt-3 text-sm font-medium text-primary">
          {t("awaiting")}
        </p>
      ) : null}

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
                      onClick={() => answer(step, value)}
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

      <Dialog open={ask !== null} onClose={() => setAsk(null)} title={t("adjust.title")}>
        <div className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            {ask && ask.moves.toDone > 0 ? (
              <p>{t("adjust.toDone", { count: ask.moves.toDone })}</p>
            ) : null}
            {ask && ask.moves.toReview > 0 ? (
              <p>{t("adjust.toReview", { count: ask.moves.toReview })}</p>
            ) : null}
            <p>{t("adjust.note")}</p>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setAsk(null)}>
              {t("adjust.cancel")}
            </Button>
            <Button variant="outline" onClick={() => confirm(false)}>
              {t("adjust.answerOnly")}
            </Button>
            <Button onClick={() => confirm(true)}>{t("adjust.answerAndAdjust")}</Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
