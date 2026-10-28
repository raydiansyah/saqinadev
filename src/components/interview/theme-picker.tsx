"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { ThemePreview } from "@/components/themes/theme-preview";
import { Button } from "@/components/ui/button";
import { THEME_CATEGORIES, THEME_TIER, themeCategoryOf, type UiThemeId } from "@/content/ui-themes";
import type { EngineCopy } from "@/lib/interview/copy";
import type { ThemeRecommendation } from "@/lib/interview/types";
import { cn } from "@/lib/utils";

type CategoryId = (typeof THEME_CATEGORIES)[number]["id"];

interface ThemeSummaryProps {
  theme: ThemeRecommendation;
  copy: EngineCopy;
}

export function ThemeSummary({ theme, copy }: ThemeSummaryProps) {
  const t = useTranslations("interview.theme");
  const tier = THEME_TIER[theme.primary];
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <ThemePreview theme={theme.primary} compact className="shrink-0" />
      <div className="space-y-3">
        <div>
          <p className="font-mono text-xs text-subtle-foreground">{t("primary")}</p>
          <p className="mt-0.5 font-medium">
            {copy.themes[theme.primary].name}{" "}
            <span className="font-mono text-xs text-muted-foreground">
              {copy.themeTiers[tier].label}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">{copy.themes[theme.primary].summary}</p>
        </div>
        <div>
          <p className="text-sm font-medium">{t("why")}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{theme.reason}</p>
        </div>
      </div>
    </div>
  );
}

interface ThemePickerProps {
  recommendation: ThemeRecommendation;
  selection: UiThemeId | undefined;
  onChange: (selection: UiThemeId | undefined) => void;
  copy: EngineCopy;
  /** The project has dashboards, reports or analytics: concept themes get a stronger warning. */
  dataScreens?: boolean;
}

/**
 * Recommendation first. "Browse themes" opens one category at a time (21 themes in 5 groups)
 * and a single choice; concept-tier themes carry a warning about accessibility effort.
 */
export function ThemePicker({
  recommendation,
  selection,
  onChange,
  copy,
  dataScreens = false,
}: ThemePickerProps) {
  const t = useTranslations("interview.theme");
  const groupId = useId();
  const [changing, setChanging] = useState(!!selection);
  const [category, setCategory] = useState<CategoryId>(
    themeCategoryOf(recommendation.primary)?.id ?? "saas",
  );
  const current = selection ?? recommendation.primary;
  const themes = THEME_CATEGORIES.find((c) => c.id === category)?.themes ?? [];

  return (
    <div className="space-y-6">
      <section
        aria-label={t("section")}
        className="rounded-lg border border-primary/50 bg-surface p-5"
      >
        <p className="mb-4 font-mono text-xs text-primary">
          {recommendation.overridden ? t("yourSelection") : t("recommended")}
        </p>
        <ThemeSummary theme={recommendation} copy={copy} />
        {THEME_TIER[recommendation.primary] === "concept" ? (
          <p className="mt-4 rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">
            {dataScreens ? t("dashboardWarning") : t("conceptWarning")}
          </p>
        ) : null}
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
            <div role="tablist" aria-label={t("categories")} className="mt-4 flex flex-wrap gap-2">
              {THEME_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className="min-h-11 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-selected:border-primary aria-selected:text-foreground"
                >
                  {copy.themeCategories[c.id]}
                </button>
              ))}
            </div>
          </div>
          <div role="tabpanel" className="divide-y divide-border px-5">
            {themes.map((id) => {
              const theme = copy.themes[id];
              const tier = THEME_TIER[id];
              const checked = current === id;
              return (
                <label
                  key={id}
                  className="grid min-h-11 cursor-pointer grid-cols-[auto_auto_1fr] items-center gap-4 py-3"
                >
                  <input
                    type="radio"
                    name={`${groupId}-theme`}
                    checked={checked}
                    onChange={() => onChange(id)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  <ThemePreview theme={id} compact />
                  <span>
                    <span className={cn("block font-medium", checked && "text-primary")}>
                      {theme.name}{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        {copy.themeTiers[tier].label}
                      </span>
                    </span>
                    <span className="block text-sm text-muted-foreground">{theme.summary}</span>
                    <span className="block text-xs text-subtle-foreground">
                      {t("bestFor", { value: theme.bestFor })}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
