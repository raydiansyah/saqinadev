"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Container } from "@/components/primitives/container";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/locales";
import { createRuleBasedEngine } from "@/lib/interview/engine";
import { PROJECT_TYPES, type ProjectTypeId } from "@/lib/interview/options";
import { createReducer, INITIAL_STATE } from "@/lib/interview/state";
import { clearState, loadState, saveState } from "@/lib/interview/storage";
import type { Answers } from "@/lib/interview/types";
import { InsightList } from "./insight-notice";
import { InterviewProgress } from "./interview-progress";
import { STEP_COMPONENTS } from "./interview-steps";
import { ProjectStage } from "./project-stage";
import { RecommendationSummary } from "./recommendation-summary";

// Navigation rules do not depend on language, so one reducer serves every locale.
const reducer = createReducer(createRuleBasedEngine());

function typeFromParam(value: string | null): ProjectTypeId | undefined {
  return PROJECT_TYPES.find((t) => t === value);
}

export function InterviewFlow({ loadingLabel }: { loadingLabel: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("interview");
  const engine = useMemo(() => createRuleBasedEngine(locale), [locale]);
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [showRequired, setShowRequired] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);

  // Restore the session once on the client.
  useEffect(() => {
    const saved = loadState();
    const type = typeFromParam(searchParams.get("type"));
    // An explicit ?type= that differs from the saved session starts a new brief for that type.
    if (saved && (!type || saved.answers.projectType === type)) {
      dispatch({ type: "hydrate", state: saved });
    } else if (type) {
      dispatch({ type: "reset", answers: { projectType: type } });
    }
    setHydrated(true);
  }, [searchParams]);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  // Move focus to the new question so keyboard and screen reader users follow along.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on step change only
  useEffect(() => {
    if (!hydrated) return;
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    setShowRequired(false);
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [state.step, hydrated]);

  const { answers, step } = state;
  const visible = useMemo(() => engine.steps(answers), [engine, answers]);
  const insights = useMemo(() => engine.insights(answers), [engine, answers]);
  const preview = useMemo(() => engine.preview(answers), [engine, answers]);
  const recommendation = useMemo(
    () => (step === "review" ? engine.recommend(answers) : null),
    [engine, answers, step],
  );

  if (!hydrated) {
    return (
      <p role="status" className="py-24 text-center text-muted-foreground">
        {loadingLabel}
      </p>
    );
  }

  const copy = engine.copy.steps[step];
  const headingId = `step-${step}-heading`;
  const complete = engine.isComplete(step, answers);
  const canGoBack = state.returnToReview || engine.previous(step, answers) !== null;
  const stepInsights = insights.filter((i) => i.step === step || step === "review");

  const update = (patch: Partial<Answers>) => dispatch({ type: "update", patch });
  const replace = (next: Answers) => dispatch({ type: "replace", answers: next });

  const onSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!complete) {
      setShowRequired(true);
      return;
    }
    dispatch({ type: "next" });
  };

  const startOver = () => {
    clearState();
    dispatch({ type: "reset" });
  };

  const StepBody = step === "review" ? null : STEP_COMPONENTS[step];

  const isReview = step === "review";

  return (
    <Container className="max-w-6xl py-10 sm:py-14">
      <div
        className={
          isReview ? "mx-auto max-w-4xl" : "grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12"
        }
      >
        <div className="min-w-0">
          <p className="mb-6 text-sm text-muted-foreground">{t("intro")}</p>
          <InterviewProgress step={step} visible={visible} groups={engine.copy.groups} />

          {/* Mobile: the live project picture folds into a summary above the question. */}
          {!isReview ? (
            <details className="mt-6 rounded-md border border-border lg:hidden">
              <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 text-sm">
                <span>
                  <span className="text-muted-foreground">{t("yourProject")} </span>
                  {preview.label ?? t("notNamed")}
                </span>
                <span aria-hidden="true" className="font-mono text-xs text-subtle-foreground">
                  {t("details")}
                </span>
              </summary>
              <div className="border-t border-border p-3">
                <ProjectStage preview={preview} copy={engine.copy} />
              </div>
            </details>
          ) : null}

          <div className="mt-10 sm:mt-12">
            <h1
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="text-balance text-2xl font-semibold tracking-tight focus-visible:outline-none sm:text-3xl"
            >
              {copy.title}
            </h1>
            {copy.hint ? <p className="mt-3 text-muted-foreground">{copy.hint}</p> : null}
          </div>

          {recommendation ? (
            <div className="mt-8 space-y-8">
              <InsightList insights={stepInsights} answers={answers} onApply={replace} />
              <RecommendationSummary
                rec={recommendation}
                engine={engine}
                visibleSteps={visible}
                accepted={state.accepted}
                onEdit={(target) => dispatch({ type: "edit", step: target })}
                onAccept={() => dispatch({ type: "accept" })}
                onStartOver={startOver}
              />
            </div>
          ) : StepBody ? (
            <form onSubmit={onSubmit} noValidate className="mt-8 space-y-6">
              <StepBody answers={answers} engine={engine} headingId={headingId} update={update} />
              <InsightList insights={stepInsights} answers={answers} onApply={replace} />

              <p aria-live="polite" className="min-h-5 text-sm text-warning">
                {showRequired && !complete ? copy.required : ""}
              </p>

              <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-between">
                {canGoBack ? (
                  <Button variant="ghost" onClick={() => dispatch({ type: "back" })}>
                    {state.returnToReview ? t("backToSummary") : t("back")}
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="submit" aria-disabled={!complete}>
                  {state.returnToReview ? t("saveAndReturn") : t("continue")}
                </Button>
              </div>
            </form>
          ) : null}
        </div>

        {!isReview ? (
          <aside className="hidden lg:block">
            <div className="sticky top-8">
              <ProjectStage preview={preview} copy={engine.copy} />
            </div>
          </aside>
        ) : null}
      </div>
    </Container>
  );
}
