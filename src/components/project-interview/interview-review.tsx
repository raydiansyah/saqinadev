import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { completeInterviewAction } from "@/app/[locale]/(app)/project/[slug]/interview/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { REQUIREMENT_GROUPS, type RequirementStatus } from "@/lib/domain/enums";
import type { Assumption } from "@/lib/interviews/analyzer";
import type { ProjectIntelligence } from "@/lib/interviews/intelligence";
import type { InterviewData, InterviewStep, QuestionKey } from "@/lib/interviews/model";
import { cn } from "@/lib/utils";
import { CreationSequence } from "./creation-sequence";
import { RecommendationPanel } from "./recommendation-panel";

const STATUS_TONE: Record<RequirementStatus, string> = {
  confirmed: "text-success border-success/40",
  inferred: "text-info border-info/40",
  unknown: "text-warning border-warning/40",
  conflicting: "text-error border-error/40",
};

export function InterviewReview({
  slug,
  data,
  intelligence,
  onChange,
  onConfirm,
  onEdit,
  flush,
}: {
  slug: string;
  data: InterviewData;
  intelligence: ProjectIntelligence;
  onChange: (next: InterviewData) => void;
  onConfirm: (key: QuestionKey) => void;
  onEdit: (step: InterviewStep) => void;
  flush: () => Promise<void>;
}) {
  const t = useTranslations("project.review");
  const reqT = useTranslations("requirements");
  const inferredT = useTranslations("project.interview.inferred");
  const errorsT = useTranslations("app.errors");
  const analysis = useMemo(() => intelligence.analyze(data), [intelligence, data]);
  const recommendation = useMemo(() => intelligence.recommend(data), [intelligence, data]);
  const [phase, setPhase] = useState<"review" | "creating" | "done">("review");
  const [error, setError] = useState<string | null>(null);
  const recommendationsRef = useRef<HTMLHeadingElement>(null);
  const { counts, conflicts, openQuestions, assumptions } = analysis;

  function confirmAssumption(a: Assumption) {
    if (a.key === "rbac") {
      onChange({
        ...data,
        answers: { ...data.answers, features: [...data.answers.features, "rbac"] },
      });
    } else if (a.key === "platform") {
      onChange({ ...data, details: { ...data.details, platforms: ["web"] } });
    } else {
      onConfirm(a.key);
    }
  }

  function toggleKept(id: string) {
    const kept = data.keptUnresolved.includes(id)
      ? data.keptUnresolved.filter((k) => k !== id)
      : [...data.keptUnresolved, id];
    onChange({ ...data, keptUnresolved: kept });
  }

  async function create() {
    setError(null);
    setPhase("creating");
    await flush();
    const result = await completeInterviewAction(slug);
    if (!result.ok) {
      setPhase("review");
      setError(result.code === "CONFLICT" ? t("resolveFirst") : errorsT(result.code));
      return;
    }
    setPhase("done");
  }

  if (phase !== "review") {
    return (
      <div className="mt-8">
        <CreationSequence done={phase === "done"} slug={slug} />
      </div>
    );
  }

  const grouped = REQUIREMENT_GROUPS.map((group) => ({
    group,
    items: analysis.requirements.filter((r) => r.group === group),
  })).filter((g) => g.items.length > 0 && g.group !== "open_questions");

  return (
    <div className="mt-8 space-y-10">
      <div>
        <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-lg">{analysis.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("complexity")}: {intelligence.engine.complexity.names[analysis.complexity.level]}.{" "}
          {analysis.complexity.reason}
        </p>
      </div>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">
          {t("summary")}
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["confirmed", "inferred", "unknown", "conflicting"] as const).map((status) => (
            <div
              key={status}
              className={cn("rounded-lg border bg-surface p-4", STATUS_TONE[status])}
            >
              <dt className="text-xs">{t(`counts.${status}`)}</dt>
              <dd className="mt-1 font-mono text-2xl text-foreground">{counts[status]}</dd>
            </div>
          ))}
        </dl>
      </section>

      {conflicts.length > 0 ? (
        <section aria-labelledby="conflicts-heading">
          <h2 id="conflicts-heading" className="font-semibold">
            {t("conflictsTitle")}
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">{t("conflictsHint")}</p>
          <ul className="space-y-3">
            {conflicts.map((c) => (
              <li key={c.id} className="rounded-lg border border-error/40 bg-surface p-4">
                <p className="font-medium">
                  <span aria-hidden="true" className="mr-1.5 text-error">
                    ⚠
                  </span>
                  {c.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{c.message}</p>
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={c.title}>
                  {c.options.map((o) => (
                    <Button
                      key={o.id}
                      size="sm"
                      variant="outline"
                      onClick={() => onChange(o.apply(data))}
                    >
                      {o.label}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {openQuestions.length > 0 ? (
        <section aria-labelledby="open-heading">
          <h2 id="open-heading" className="font-semibold">
            {t("openTitle")}
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">{t("openHint")}</p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {openQuestions.map((q) => (
              <li
                key={q.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium">{q.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {q.kept ? <span className="text-warning">{t("keptOpen")}. </span> : null}
                    {q.message}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => onEdit(q.step)}>
                    {t("defineNow")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-pressed={q.kept}
                    onClick={() => toggleKept(q.id)}
                  >
                    {t("keepOpen")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {assumptions.length > 0 ? (
        <section aria-labelledby="assumptions-heading">
          <h2 id="assumptions-heading" className="mb-4 font-semibold">
            {t("assumptionsTitle")}
          </h2>
          <ul className="space-y-3">
            {assumptions.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-3 rounded-lg border border-info/40 bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-sm">{a.message}</p>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => confirmAssumption(a)}>
                    {inferredT("confirm")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onEdit(
                        a.key === "rbac" || a.key === "features"
                          ? "features"
                          : a.key === "audience"
                            ? "audience"
                            : a.key === "platform"
                              ? "platform"
                              : "project",
                      )
                    }
                  >
                    {inferredT("change")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="requirements-heading">
        <h2 id="requirements-heading" className="mb-4 font-semibold">
          {t("requirementsTitle")}
        </h2>
        <div className="space-y-2">
          {grouped.map(({ group, items }) => (
            <details
              key={group}
              className="rounded-lg border border-border"
              open={group === "features"}
            >
              <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4">
                <span className="font-medium">{intelligence.copy.groups[group]}</span>
                <span className="font-mono text-xs text-muted-foreground">{items.length}</span>
              </summary>
              <ul className="divide-y divide-border border-t border-border">
                {items.map((r) => (
                  <li
                    key={r.key}
                    className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{r.title}</p>
                      <p className="text-muted-foreground">{r.description}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-xs",
                        STATUS_TONE[r.status],
                      )}
                    >
                      {reqT(`statuses.${r.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>

      {analysis.risks.length > 0 ? (
        <section aria-labelledby="risks-heading">
          <h2 id="risks-heading" className="mb-3 font-semibold">
            {t("risksTitle")}
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {analysis.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="recommendation-heading">
        <h2
          id="recommendation-heading"
          ref={recommendationsRef}
          tabIndex={-1}
          className="font-semibold focus-visible:outline-none"
        >
          {t("recommendationTitle")}
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{t("recommendationHint")}</p>
        <RecommendationPanel
          items={recommendation.items}
          onOverride={(key, value) => {
            const overrides = { ...data.overrides };
            if (value === null) delete overrides[key];
            else overrides[key] = value;
            onChange({ ...data, overrides });
          }}
        />
      </section>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-4 backdrop-blur-sm sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        {error ? (
          <Notice tone="error" className="mb-4">
            {error}
          </Notice>
        ) : null}
        {conflicts.length > 0 ? (
          <p className="mb-3 text-sm text-warning">{t("resolveFirst")}</p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button size="lg" onClick={create} disabled={conflicts.length > 0}>
            {t("accept")}
          </Button>
          <Button size="lg" variant="outline" onClick={() => onEdit("features")}>
            {t("editRequirements")}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={() => {
              recommendationsRef.current?.scrollIntoView({ block: "start" });
              recommendationsRef.current?.focus();
            }}
          >
            {t("changeRecommendation")}
          </Button>
        </div>
      </div>
    </div>
  );
}
