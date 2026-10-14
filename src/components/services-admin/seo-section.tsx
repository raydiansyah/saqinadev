"use client";

import { useTranslations } from "next-intl";
import { FIELD_CLASS } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { errorAt, Section, type SectionProps } from "./editor-ui";

function Counter({ count, max, id }: { count: number; max: number; id: string }) {
  const t = useTranslations("servicesAdmin.editor.seo");
  return (
    <p
      id={id}
      className={cn(
        "mt-1.5 text-xs tabular-nums",
        count > max ? "text-error" : "text-subtle-foreground",
      )}
    >
      {t("counter", { count, max })}
    </p>
  );
}

export function SeoSection({ state, set, errors }: SectionProps) {
  const t = useTranslations("servicesAdmin.editor");
  return (
    <Section id="sec-seo" title={t("sections.seo")}>
      <p className="text-sm text-muted-foreground">{t("seo.hint")}</p>
      <div className="grid gap-5 lg:grid-cols-2">
        {(["en", "id"] as const).map((loc) => {
          const titleId = `svc-meta-title-${loc}`;
          const descId = `svc-meta-desc-${loc}`;
          return (
            <div key={loc} lang={loc} className="space-y-4">
              <div>
                <label htmlFor={titleId} className="mb-1.5 block text-sm font-medium">
                  {t("seo.metaTitle")} ({loc.toUpperCase()})
                </label>
                <input
                  id={titleId}
                  value={state.metaTitle[loc]}
                  aria-describedby={`${titleId}-count`}
                  aria-invalid={errorAt(errors, `metaTitle.${loc}`) ? true : undefined}
                  onChange={(e) => set("metaTitle", { ...state.metaTitle, [loc]: e.target.value })}
                  className={cn(FIELD_CLASS, "min-h-11 py-2.5")}
                />
                <Counter id={`${titleId}-count`} count={state.metaTitle[loc].length} max={70} />
                {errorAt(errors, `metaTitle.${loc}`) ? (
                  <p className="mt-1 text-sm text-error">{errorAt(errors, `metaTitle.${loc}`)}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor={descId} className="mb-1.5 block text-sm font-medium">
                  {t("seo.metaDescription")} ({loc.toUpperCase()})
                </label>
                <textarea
                  id={descId}
                  rows={3}
                  value={state.metaDescription[loc]}
                  aria-describedby={`${descId}-count`}
                  aria-invalid={errorAt(errors, `metaDescription.${loc}`) ? true : undefined}
                  onChange={(e) =>
                    set("metaDescription", { ...state.metaDescription, [loc]: e.target.value })
                  }
                  className={cn(FIELD_CLASS, "resize-y py-2.5 leading-relaxed")}
                />
                <Counter
                  id={`${descId}-count`}
                  count={state.metaDescription[loc].length}
                  max={170}
                />
                {errorAt(errors, `metaDescription.${loc}`) ? (
                  <p className="mt-1 text-sm text-error">
                    {errorAt(errors, `metaDescription.${loc}`)}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
