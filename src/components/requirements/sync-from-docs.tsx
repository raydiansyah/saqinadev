"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { syncRequirementsAction } from "@/app/[locale]/(app)/project/[slug]/requirements/actions";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import type { SyncResult } from "@/lib/imports/sync";

/** For imported projects: read the repository documents again and add what is missing. */
export function SyncFromDocs({ slug }: { slug: string }) {
  const t = useTranslations("requirements.sync");
  const caps = useTranslations("platform.models.capabilityNames");
  const locale = useLocale();
  const id = useId();
  const [useAi, setUseAi] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const { pending, error, run } = useRun();

  return (
    <section aria-labelledby={`${id}-h`} className="mb-6 rounded-lg border border-border p-4">
      <h2 id={`${id}-h`} className="text-sm font-medium">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("body")}</p>
      <label className="mt-3 flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={useAi}
          onChange={(e) => setUseAi(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span>
          <span className="font-medium">{t("aiLabel")}</span>
          <span className="mt-1 block text-muted-foreground">{t("aiHint")}</span>
        </span>
      </label>
      <div className="mt-3">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            setResult(null);
            run<SyncResult>(() => syncRequirementsAction(slug, useAi, locale), setResult);
          }}
        >
          {pending ? t("running") : t("run")}
        </Button>
      </div>
      {error ? (
        <Notice tone="error" className="mt-3">
          {error.code === "RATE_LIMIT" ? t("rateLimit") : t("failed")}
        </Notice>
      ) : null}
      {result && !error ? (
        <div className="mt-3 space-y-2" role="status">
          <Notice tone={result.added > 0 ? "success" : "info"}>
            {result.noDocs
              ? t("noDocs")
              : result.added > 0
                ? t("added", { count: result.added })
                : t("nothingNew")}
          </Notice>
          {result.aiProblem ? (
            <Notice tone="warning">
              {t(`unavailable.${result.aiProblem.reason}`, {
                model: result.aiProblem.model ?? "",
                missing: (result.aiProblem.missing ?? []).map((c) => caps(c)).join(", "),
                code: result.aiProblem.code ?? "",
              })}
            </Notice>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
