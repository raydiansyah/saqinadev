"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useExecutionContext } from "./context";

const GLYPH = { done: "✓", pending: "…", blocked: "!", unknown: "?" } as const;
const TONE = {
  done: "text-success border-success/40",
  pending: "text-info border-info/40",
  blocked: "text-error border-error/40",
  unknown: "text-muted-foreground border-border",
} as const;

/**
 * Five different facts on the way to a live site, kept apart: the code is written, the build passed,
 * a preview works, the deployment is set up, and it is published. Publishing is a person's step; this
 * only shows how far things are.
 */
export function PublishStages() {
  const t = useTranslations("studio.execution.stages");
  const { delivery, want } = useExecutionContext();
  useEffect(() => want("delivery"), [want]);
  const stages = delivery.data?.stages ?? null;
  if (!stages)
    return delivery.error ? (
      <p className="mb-6 text-sm text-muted-foreground">{t("failed")}</p>
    ) : (
      <p role="status" className="mb-6 text-sm text-muted-foreground">
        {t("reading")}
      </p>
    );
  return (
    <section aria-labelledby="exec-stages-title" className="mb-6 space-y-2">
      <h3
        id="exec-stages-title"
        className="font-mono text-xs uppercase tracking-wider text-subtle-foreground"
      >
        {t("title")}
      </h3>
      <ol className="space-y-1.5">
        {stages.map((s) => (
          <li key={s.key} className="flex items-start gap-3 rounded-md border border-border p-2.5">
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm border font-mono text-xs",
                TONE[s.state],
              )}
            >
              {GLYPH[s.state]}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {t(`${s.key}.name`)} <span className="sr-only">: {t(`state.${s.state}`)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {s.detail && t.has(`${s.key}.${s.detail}` as never)
                  ? t(`${s.key}.${s.detail}` as never)
                  : t(`${s.key}.${s.state}` as never)}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">{t("personNote")}</p>
    </section>
  );
}
