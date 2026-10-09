"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { setWarrantyAction } from "@/app/[locale]/(app)/project/[slug]/maintenance/actions";
import { formatDay } from "@/components/billing/format";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { EngagementError } from "./engagement-error";

/** The project's warranty end date; bugs until then are suggested as warranty fixes. */
export function WarrantyForm({
  slug,
  warrantyUntil,
  daysLeft,
  canWrite,
}: {
  slug: string;
  warrantyUntil: string | null;
  daysLeft: number | null;
  canWrite: boolean;
}) {
  const t = useTranslations("engagement.maintenance");
  const common = useTranslations("engagement.common");
  const locale = useLocale();
  const id = useId();
  const { pending, error, run } = useRun();
  const status =
    warrantyUntil === null || daysLeft === null
      ? t("warrantyNone")
      : daysLeft < 0
        ? `${t("warrantyEnded")} (${formatDay(warrantyUntil, locale)})`
        : `${formatDay(warrantyUntil, locale)} · ${t("warrantyLeft", { days: daysLeft })}`;

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-lg border border-border p-4 sm:p-5">
      <h2 id={`${id}-title`} className="font-semibold">
        {t("warrantyTitle")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("warrantyHint")}</p>
      <p className="mt-3 text-sm" aria-live="polite">
        {status}
      </p>
      {canWrite ? (
        <form
          key={warrantyUntil ?? "none"}
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          action={(form) =>
            run(() =>
              setWarrantyAction(slug, {
                warrantyUntil: String(form.get("warrantyUntil") ?? "") || null,
              }),
            )
          }
        >
          <div className="sm:w-56">
            <Field
              id={`${id}-date`}
              name="warrantyUntil"
              type="date"
              label={t("warrantyUntil")}
              defaultValue={warrantyUntil ?? ""}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {common("save")}
            </Button>
            {warrantyUntil ? (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => setWarrantyAction(slug, { warrantyUntil: null }))}
              >
                {t("clear")}
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
      <EngagementError error={error} />
    </section>
  );
}
