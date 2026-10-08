"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { SaveIndicator } from "@/components/app/save-indicator";
import { InsightList } from "@/components/interview/insight-notice";
import { STEP_COMPONENTS } from "@/components/interview/interview-steps";
import { ProjectStage } from "@/components/interview/project-stage";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/locales";
import { createRuleBasedEngine } from "@/lib/interview/engine";
import type { Answers, StepId } from "@/lib/interview/types";
import { createProjectIntelligence } from "@/lib/interviews/intelligence";
import {
  type InterviewData,
  type InterviewStep,
  isComplete,
  isRequired,
  nextVisible,
  type ProjectDetails,
  previousVisible,
  type QuestionKey,
  STAGE_OF,
  STAGES,
  visibleSteps,
} from "@/lib/interviews/model";
import { cn } from "@/lib/utils";
import { ConstraintsStep, FollowUpsStep, PlatformStep } from "./extra-steps";
import { InferredNotice } from "./inferred-notice";
import { InterviewReview } from "./interview-review";
import { changedKeys, useAutosave } from "./use-autosave";

/** Steps whose answer may have been inferred from the idea and needs confirmation. */
const INFERRED_KEY: Partial<Record<InterviewStep, QuestionKey>> = {
  project: "projectType",
  audience: "audience",
  features: "features",
};

export function ProjectInterview({
  slug,
  locale,
  initialData,
  initialStep,
}: {
  slug: string;
  locale: Locale;
  initialData: InterviewData;
  initialStep: InterviewStep;
}) {
  const t = useTranslations("project.interview");
  const engine = useMemo(() => createRuleBasedEngine(locale), [locale]);
  const intelligence = useMemo(() => createProjectIntelligence(locale), [locale]);
  const [data, setData] = useState(initialData);
  const [step, setStep] = useState<InterviewStep>(initialStep);
  const [showRequired, setShowRequired] = useState(false);
  const autosave = useAutosave(slug, initialStep);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const visible = visibleSteps(data);
  // A changed answer can hide the current step (e.g. a new project type has no follow-ups).
  const current = visible.includes(step) ? step : nextVisible(step, data);

  // Runs on step change only: move focus to the new question for keyboard and screen readers.
  // biome-ignore lint/correctness/useExhaustiveDependencies: current is the trigger
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setShowRequired(false);
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [current]);

  function apply(next: InterviewData) {
    const keys = changedKeys(data, next);
    // Anything the user changes is theirs, no longer inferred.
    const sources = { ...next.sources };
    for (const k of keys) delete sources[k];
    const final = { ...next, sources };
    setData(final);
    autosave.track(final, keys);
  }

  const update = (patch: Partial<Answers>) =>
    apply({ ...data, answers: { ...data.answers, ...patch } });
  const updateDetails = (patch: Partial<ProjectDetails>) =>
    apply({ ...data, details: { ...data.details, ...patch } });

  function confirmKey(key: QuestionKey) {
    const sources = { ...data.sources };
    delete sources[key];
    const next = { ...data, sources };
    setData(next);
    autosave.confirm(next, key);
  }

  function go(target: InterviewStep) {
    setStep(target);
    autosave.moveTo(data, target);
  }

  const complete = isComplete(current, data);
  const required = isRequired(current);
  const onContinue = () => {
    if (!complete && required) {
      setShowRequired(true);
      return;
    }
    go(nextVisible(current, data));
  };
  const previous = previousVisible(current, data);

  const stage = STAGE_OF[current];
  const stageIndex = STAGES.indexOf(stage);
  const headingId = `interview-${current}-heading`;
  const copy =
    current === "followups" || current === "platform" || current === "constraints"
      ? { title: t(`${current}.title`), hint: t(`${current}.hint`), required: "" }
      : current === "review"
        ? null
        : engine.copy.steps[current];
  const inferredKey = INFERRED_KEY[current];
  const insights = engine.insights(data.answers).filter((i) => i.step === current);
  const Phase1Step =
    current !== "review" && current in STEP_COMPONENTS
      ? STEP_COMPONENTS[current as Exclude<StepId, "review">]
      : null;

  return (
    <div className={cn(current !== "review" && "grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ol aria-label={t("progressLabel")} className="flex flex-wrap gap-1.5">
            {STAGES.map((s, i) => (
              <li
                key={s}
                aria-current={s === stage ? "step" : undefined}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs",
                  i < stageIndex && "border-success/40 text-success",
                  s === stage && "border-primary bg-primary/10 text-foreground",
                  i > stageIndex && "border-border text-subtle-foreground",
                )}
              >
                <span aria-hidden="true" className="mr-1 font-mono">
                  {i < stageIndex ? "✓" : s === stage ? "●" : "○"}
                </span>
                {t(`stages.${s}`)}
              </li>
            ))}
          </ol>
          <SaveIndicator state={autosave.state} />
        </div>
        <p className="sr-only" aria-live="polite">
          {t("stageOf", {
            current: stageIndex + 1,
            total: STAGES.length,
            name: t(`stages.${stage}`),
          })}
        </p>

        {current === "review" ? (
          <InterviewReview
            slug={slug}
            data={data}
            intelligence={intelligence}
            onChange={apply}
            onConfirm={confirmKey}
            onEdit={go}
            flush={autosave.flush}
          />
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              onContinue();
            }}
            className="panel-in mt-8"
            key={current}
          >
            <h1
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-semibold tracking-tight text-balance focus-visible:outline-none sm:text-3xl"
            >
              {copy?.title}
            </h1>
            {copy?.hint ? <p className="mt-3 text-muted-foreground">{copy.hint}</p> : null}

            <div className="mt-8 space-y-6">
              {inferredKey && data.sources[inferredKey] === "inferred" ? (
                <InferredNotice
                  questionKey={inferredKey}
                  data={data}
                  engine={engine.copy}
                  onConfirm={() => confirmKey(inferredKey)}
                />
              ) : null}

              {Phase1Step ? (
                <Phase1Step
                  answers={data.answers}
                  engine={engine}
                  headingId={headingId}
                  update={update}
                />
              ) : current === "followups" ? (
                <FollowUpsStep
                  data={data}
                  copy={intelligence.copy}
                  headingId={headingId}
                  updateDetails={updateDetails}
                />
              ) : current === "platform" ? (
                <PlatformStep
                  data={data}
                  copy={intelligence.copy}
                  headingId={headingId}
                  updateDetails={updateDetails}
                />
              ) : (
                <ConstraintsStep
                  data={data}
                  copy={intelligence.copy}
                  headingId={headingId}
                  updateDetails={updateDetails}
                />
              )}

              <InsightList
                insights={insights}
                answers={data.answers}
                onApply={(answers) => apply({ ...data, answers })}
              />
            </div>

            <p aria-live="polite" className="mt-4 min-h-5 text-sm text-warning">
              {showRequired && copy ? copy.required : ""}
            </p>

            <div className="mt-2 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
              {previous ? (
                <Button variant="ghost" onClick={() => go(previous)}>
                  {t("back")}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                {!required && !complete ? (
                  <Button
                    variant="outline"
                    onClick={() => go(nextVisible(current, data))}
                    title={t("skipHint")}
                  >
                    {t("skip")}
                  </Button>
                ) : null}
                <Button type="submit" aria-disabled={!complete && required}>
                  {nextVisible(current, data) === "review" ? t("toReview") : t("continue")}
                </Button>
              </div>
            </div>
            {!required && !complete ? (
              <p className="mt-3 text-xs text-subtle-foreground">{t("skipHint")}</p>
            ) : null}
          </form>
        )}
      </div>

      {current !== "review" ? (
        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <ProjectStage preview={engine.preview(data.answers)} copy={engine.copy} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}
