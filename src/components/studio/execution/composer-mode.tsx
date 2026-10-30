"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const COMPOSER_MODES = ["chat", "plan", "build"] as const;
export type ComposerMode = (typeof COMPOSER_MODES)[number];

const KEY = (slug: string) => `saqina.composerMode.${slug}`;

/** The chosen mode is a per-person convenience, so it lives in the browser and the page works without it. */
export function useComposerMode(slug: string): [ComposerMode, (mode: ComposerMode) => void] {
  const [mode, setMode] = useState<ComposerMode>("chat");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY(slug));
      if (saved === "plan" || saved === "build" || saved === "chat") setMode(saved);
    } catch {
      // Storage can be blocked; the default stays.
    }
  }, [slug]);
  return [
    mode,
    (next) => {
      setMode(next);
      try {
        localStorage.setItem(KEY(slug), next);
      } catch {
        // Not saved; it still works for this visit.
      }
    },
  ];
}

/** Chat talks, Plan makes a plan, Build starts the agents. The line under it says what will happen. */
export function ComposerModeSwitch({
  mode,
  onChange,
  disabled,
}: {
  mode: ComposerMode;
  onChange: (mode: ComposerMode) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("studio.execution");
  return (
    <div className="mb-2">
      <div
        role="radiogroup"
        aria-label={t("modeLabel")}
        className="inline-flex rounded-md border border-border p-0.5"
      >
        {COMPOSER_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            disabled={disabled}
            onClick={() => onChange(m)}
            className={cn(
              "min-h-9 min-w-16 rounded px-3 text-sm transition-colors motion-reduce:transition-none",
              mode === m
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`modes.${m}`)}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-subtle-foreground">{t(`modeHint.${mode}`)}</p>
    </div>
  );
}
