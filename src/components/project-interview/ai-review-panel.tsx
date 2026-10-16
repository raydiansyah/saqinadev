import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { aiReviewAction } from "@/app/[locale]/(app)/project/[slug]/interview/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import type { AiReview, SuggestableKey } from "@/lib/interviews/ai-review";
import type { InterviewData } from "@/lib/interviews/model";
import { cn } from "@/lib/utils";

const LEVEL_TONE = {
  ok: "text-success border-success/40",
  check: "text-warning border-warning/40",
  missing: "text-info border-info/40",
} as const;

const show = (value: unknown) => (Array.isArray(value) ? value.join(", ") : String(value));

/**
 * AI review of the answers by the platform's configured model. Advice only: each suggestion
 * waits for an explicit Apply, and an applied value is saved like any answer the person typed.
 */
export function AiReviewPanel({
  slug,
  data,
  onChange,
}: {
  slug: string;
  data: InterviewData;
  onChange: (next: InterviewData) => void;
}) {
  const t = useTranslations("project.review");
  const caps = useTranslations("platform.models.capabilityNames");
  const errorsT = useTranslations("app.errors");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [review, setReview] = useState<AiReview | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await aiReviewAction(slug, locale);
      if (!result.ok) {
        setError(errorsT(result.code));
        return;
      }
      setApplied(new Set());
      setReview(result.data);
    });
  }

  function apply(keys: SuggestableKey[]) {
    if (!review?.available) return;
    // Values were validated against the answer schemas on the server.
    const picked = Object.fromEntries(
      keys.map((key) => [key, review.suggestions[key]]),
    ) as unknown as Partial<InterviewData["answers"]>;
    onChange({ ...data, answers: { ...data.answers, ...picked } });
    setApplied((prev) => new Set([...prev, ...keys]));
  }

  const suggestions = review?.available
    ? (Object.keys(review.suggestions) as SuggestableKey[])
    : [];
  const open = suggestions.filter((k) => !applied.has(k));

  return (
    <section
      aria-labelledby="ai-review-heading"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="ai-review-heading" className="font-semibold">
        {t("ai.title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("ai.body")}</p>
      <p className="mt-1 text-xs text-subtle-foreground">{t("ai.privacy")}</p>
      <div className="mt-4">
        <Button type="button" variant="outline" onClick={run} disabled={pending}>
          {pending ? t("ai.pending") : review ? t("ai.again") : t("ai.button")}
        </Button>
      </div>

      <div aria-live="polite" className="mt-4 space-y-4">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {review && !review.available ? (
          <Notice tone="warning">
            {t(`ai.reasons.${review.reason}`, {
              model: review.model ?? "",
              missing: (review.missing ?? []).map((c) => caps(c)).join(", "),
              code: review.code ?? "",
            })}
          </Notice>
        ) : null}
        {review?.available ? (
          <>
            <p className="text-xs text-muted-foreground">
              {t("ai.reviewedBy", { model: review.model })}
            </p>
            <p>{review.summary}</p>
            {review.notes.length > 0 ? (
              <ul className="space-y-2">
                {review.notes.map((n) => (
                  <li
                    key={`${n.key}-${n.note}`}
                    className="flex flex-wrap items-start gap-2 text-sm"
                  >
                    <span
                      className={cn("rounded-full border px-2 py-0.5 text-xs", LEVEL_TONE[n.level])}
                    >
                      {t(`ai.levels.${n.level}`)}
                    </span>
                    <span className="font-medium">{t(`ai.fields.${n.key}`)}</span>
                    <span className="text-muted-foreground">{n.note}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div>
              <h3 className="text-sm font-medium">{t("ai.suggestions")}</h3>
              {suggestions.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">{t("ai.noSuggestions")}</p>
              ) : (
                <>
                  <ul className="mt-2 space-y-2">
                    {suggestions.map((key) => (
                      <li
                        key={key}
                        className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3 text-sm"
                      >
                        <span className="font-medium">{t(`ai.fields.${key}`)}</span>
                        <span className="min-w-0 flex-1 break-words text-muted-foreground">
                          {show(review.suggestions[key])}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={applied.has(key)}
                          onClick={() => apply([key])}
                        >
                          {applied.has(key) ? t("ai.applied") : t("ai.apply")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {open.length > 1 ? (
                    <Button type="button" size="sm" className="mt-3" onClick={() => apply(open)}>
                      {t("ai.applyAll")}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
