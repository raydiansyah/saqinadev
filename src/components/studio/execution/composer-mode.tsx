"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
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
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  // A radio group is one tab stop; the arrow keys move between its choices and choose them.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = COMPOSER_MODES.indexOf(mode);
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = COMPOSER_MODES[(i + step + COMPOSER_MODES.length) % COMPOSER_MODES.length];
    onChange(next);
    refs.current[next]?.focus();
  };
  return (
    <div className="mb-2">
      <div
        role="radiogroup"
        aria-label={t("modeLabel")}
        onKeyDown={onKeyDown}
        className="inline-flex rounded-md border border-border p-0.5"
      >
        {COMPOSER_MODES.map((m) => (
          <button
            key={m}
            ref={(el) => {
              refs.current[m] = el;
            }}
            type="button"
            role="radio"
            aria-checked={mode === m}
            tabIndex={mode === m ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(m)}
            className={cn(
              "min-h-11 min-w-16 rounded px-3 text-sm transition-colors motion-reduce:transition-none sm:min-h-9",
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
