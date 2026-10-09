"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import type { ActionResult } from "@/lib/errors";
import { cn } from "@/lib/utils";

/** On/off switch for one reminder rule. */
export function ReminderRuleToggle({
  id,
  enabled,
  label,
  disabled,
  toggle,
}: {
  id: string;
  enabled: boolean;
  label: string;
  disabled: boolean;
  toggle: (id: string, enabled: boolean) => Promise<ActionResult<void>>;
}) {
  const t = useTranslations("reminders.rules");
  const { pending, error, run } = useRun();
  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        disabled={disabled || pending}
        onClick={() => run(() => toggle(id, !enabled))}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-1 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative h-5 w-9 rounded-full border transition-colors",
            enabled ? "border-primary bg-primary" : "border-border-strong bg-surface-raised",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-3.5 rounded-full bg-background transition-[left] motion-reduce:transition-none",
              enabled ? "left-[1.125rem]" : "left-0.5",
            )}
          />
        </span>
        <span aria-hidden="true" className="w-12 text-left">
          {enabled ? t("enabled") : t("disabled")}
        </span>
      </button>
      <FormError error={error} />
    </div>
  );
}

/** "Run now": the same job the daily cron runs, for this organization only. */
export function RunRemindersButton({
  run: runReminders,
}: {
  run: () => Promise<ActionResult<{ sent: number; skipped: number }>>;
}) {
  const t = useTranslations("reminders.run");
  const { pending, error, run } = useRun();
  const [result, setResult] = useState<{ sent: number; skipped: number } | null>(null);
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          setResult(null);
          run<{ sent: number; skipped: number }>(runReminders, setResult);
        }}
      >
        {pending ? t("running") : t("button")}
      </Button>
      {result ? (
        <Notice tone="success" className="max-w-xs">
          {t("result", result).trim()}
        </Notice>
      ) : null}
      <FormError error={error} />
    </div>
  );
}
