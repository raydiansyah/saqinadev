"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CONCEPT_CATEGORIES,
  categoryOf,
  type LandingConceptId,
  MAX_SUPPORTING_CONCEPTS,
} from "@/content/landing-concepts";
import type { EngineCopy } from "@/lib/interview/copy";
import type { LandingRecommendation, LandingSelection } from "@/lib/interview/types";
import { cn } from "@/lib/utils";

type CategoryId = (typeof CONCEPT_CATEGORIES)[number]["id"];

/** A tiny schematic per category, so "why it fits" is shown and not only told. */
function ConceptSketch({ category }: { category: CategoryId }) {
  const box = "rounded-sm border border-border-strong";
  const sketches: Record<CategoryId, ReactNode> = {
    story: (
      <div className="flex h-full flex-col gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn(box, "flex-1", i === 1 && "border-primary/70")} />
        ))}
      </div>
    ),
    interaction: (
      <div className="grid h-full grid-cols-[1fr_1.4fr] gap-1.5">
        <div className={cn(box, "border-primary/70")} />
        <div className={box} />
      </div>
    ),
    spatial: (
      <div className="relative h-full">
        <div className={cn(box, "absolute inset-x-4 top-1 bottom-4")} />
        <div
          className={cn(box, "absolute inset-x-1 top-4 bottom-1 border-primary/70 bg-surface")}
        />
      </div>
    ),
    system: (
      <div className="flex h-full items-center justify-between">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn(box, "size-6", i === 1 && "border-primary/70")} />
        ))}
      </div>
    ),
    conversion: (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <div className="h-1.5 w-3/4 rounded-full bg-border-strong" />
        <div className="h-4 w-1/3 rounded-sm bg-primary/70" />
      </div>
    ),
    foundation: (
      <div className="flex h-full items-end gap-1.5">
        {[40, 65, 90].map((h) => (
          <div key={h} className="flex-1 rounded-sm bg-border-strong" style={{ height: `${h}%` }} />
        ))}
      </div>
    ),
  };
  return (
    <div
      aria-hidden="true"
      className="h-20 w-28 shrink-0 rounded-md border border-border bg-background p-2.5"
    >
      {sketches[category]}
    </div>
  );
}

interface ConceptSummaryProps {
  landing: LandingRecommendation;
  copy: EngineCopy;
}

export function ConceptSummary({ landing, copy }: ConceptSummaryProps) {
  const t = useTranslations("interview.concept");
  const category = categoryOf(landing.primary)?.id ?? "story";
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <ConceptSketch category={category} />
      <div className="space-y-3">
        <div>
          <p className="font-mono text-xs text-subtle-foreground">{t("primary")}</p>
          <p className="mt-0.5 font-medium">{copy.concepts[landing.primary].name}</p>
        </div>
        {landing.supporting.length > 0 ? (
          <div>
            <p className="font-mono text-xs text-subtle-foreground">{t("supporting")}</p>
            <ul className="mt-0.5">
              {landing.supporting.map((id) => (
                <li key={id}>{copy.concepts[id].name}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div>
          <p className="text-sm font-medium">{t("why")}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{landing.reason}</p>
        </div>
      </div>
    </div>
  );
}

interface ConceptPickerProps {
  recommendation: LandingRecommendation;
  selection: LandingSelection | undefined;
  onChange: (selection: LandingSelection | undefined) => void;
  copy: EngineCopy;
}

/**
 * Recommendation first. "Change Concept" opens one category at a time instead of
 * 18 options at once, and enforces 1 primary + up to 2 supporting.
 */
export function ConceptPicker({ recommendation, selection, onChange, copy }: ConceptPickerProps) {
  const t = useTranslations("interview.concept");
  const groupId = useId();
  const [changing, setChanging] = useState(!!selection);
  const [category, setCategory] = useState<CategoryId>(
    categoryOf(recommendation.primary)?.id ?? "story",
  );
  const current: LandingSelection = selection ?? {
    primary: recommendation.primary,
    supporting: recommendation.supporting,
  };
  const full = current.supporting.length >= MAX_SUPPORTING_CONCEPTS;
  const concepts = CONCEPT_CATEGORIES.find((c) => c.id === category)?.concepts ?? [];

  const setPrimary = (id: LandingConceptId) =>
    onChange({ primary: id, supporting: current.supporting.filter((s) => s !== id) });

  const toggleSupporting = (id: LandingConceptId) =>
    onChange({
      primary: current.primary,
      supporting: current.supporting.includes(id)
        ? current.supporting.filter((s) => s !== id)
        : [...current.supporting, id],
    });

  return (
    <div className="space-y-6">
      <section
        aria-label={t("experience")}
        className="rounded-lg border border-primary/50 bg-surface p-5"
      >
        <p className="mb-4 font-mono text-xs text-primary">
          {recommendation.overridden ? t("yourSelection") : t("recommended")}
        </p>
        <ConceptSummary landing={recommendation} copy={copy} />
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {selection ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onChange(undefined);
                setChanging(false);
              }}
            >
              {t("useRecommendation")}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            aria-expanded={changing}
            onClick={() => setChanging((v) => !v)}
          >
            {t("change")}
          </Button>
        </div>
      </section>

      {changing ? (
        <section aria-labelledby={groupId} className="rounded-lg border border-border">
          <div className="border-b border-border px-5 py-4">
            <p id={groupId} className="font-medium">
              {t("byCategory")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("limits", { max: MAX_SUPPORTING_CONCEPTS })}{" "}
              <span aria-live="polite">{full ? t("limitReached") : ""}</span>
            </p>
            <div role="tablist" aria-label={t("categories")} className="mt-4 flex flex-wrap gap-2">
              {CONCEPT_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className="min-h-11 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-selected:border-primary aria-selected:text-foreground"
                >
                  {copy.categories[c.id]}
                </button>
              ))}
            </div>
          </div>
          <ul role="tabpanel" className="divide-y divide-border px-5">
            {concepts.map((id) => {
              const concept = copy.concepts[id];
              const isPrimary = current.primary === id;
              const isSupporting = current.supporting.includes(id);
              const lockSupport = isPrimary || (full && !isSupporting);
              return (
                <li key={id} className="grid gap-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className={cn("font-medium", (isPrimary || isSupporting) && "text-primary")}>
                      {concept.name}
                    </p>
                    <p className="text-sm text-muted-foreground">{concept.summary}</p>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name={`${groupId}-primary`}
                        checked={isPrimary}
                        onChange={() => setPrimary(id)}
                        className="size-4 accent-[var(--primary)]"
                      />
                      {t("primary")}
                      <span className="sr-only">: {concept.name}</span>
                    </label>
                    <label
                      className={cn(
                        "inline-flex min-h-11 items-center gap-2",
                        lockSupport ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSupporting}
                        disabled={lockSupport}
                        onChange={() => toggleSupporting(id)}
                        className="size-4 accent-[var(--primary)]"
                      />
                      {t("supporting")}
                      <span className="sr-only">: {concept.name}</span>
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
