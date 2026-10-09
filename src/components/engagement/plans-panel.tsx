"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { renewPlanAction } from "@/app/[locale]/(app)/project/[slug]/maintenance/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { formatDay } from "@/components/billing/format";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import type { Currency } from "@/lib/domain/business";
import { formatMoney } from "@/lib/money";
import { Chip } from "./chip";
import { useEngagementErrorText } from "./engagement-error";
import { PlanDialog, type PlanView } from "./plan-dialog";

const STATUS_TONE = { active: "success", ended: "neutral", cancelled: "muted" } as const;

/** Maintenance plans with period, fee per cycle, days left and renewal. */
export function PlansPanel({
  slug,
  currency,
  plans,
  canWrite,
}: {
  slug: string;
  currency: Currency;
  plans: (PlanView & { daysLeft: number })[];
  canWrite: boolean;
}) {
  const t = useTranslations("engagement.maintenance");
  const locale = useLocale();
  const id = useId();
  const [editing, setEditing] = useState<PlanView | "new" | null>(null);
  const [renewing, setRenewing] = useState<PlanView | null>(null);
  const { pending, error, run, clear } = useRun();
  const errorText = useEngagementErrorText(error);

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-lg border border-border p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="font-semibold">
          {t("plansTitle")}
        </h2>
        {canWrite ? <Button onClick={() => setEditing("new")}>{t("newPlan")}</Button> : null}
      </div>
      {plans.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("plansEmpty")}</p>
      ) : (
        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("name")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("period")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t("feeColumn")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("status")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("daysLeft")}
                </th>
                {canWrite ? (
                  <th scope="col" className="py-2 text-right font-medium">
                    {t("actions")}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plans.map((p) => {
                const soon = p.status === "active" && p.daysLeft >= 0 && p.daysLeft <= 30;
                return (
                  <tr key={p.id}>
                    <td className="max-w-48 truncate py-2 pr-3 font-medium">{p.name}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {formatDay(p.startDate, locale)} - {formatDay(p.endDate, locale)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">
                      {t("perCycle", {
                        amount: formatMoney(p.fee, currency, locale),
                        cycle: t(`cycles.${p.cycle}`),
                      })}
                    </td>
                    <td className="py-2 pr-3">
                      <Chip tone={STATUS_TONE[p.status]}>{t(`statuses.${p.status}`)}</Chip>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {p.status !== "active" ? (
                        "-"
                      ) : p.daysLeft < 0 ? (
                        <Chip tone="error">{t("expired")}</Chip>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="font-mono">{p.daysLeft}</span>
                          {soon ? <Chip tone="warning">{t("renewsSoon")}</Chip> : null}
                        </span>
                      )}
                    </td>
                    {canWrite ? (
                      <td className="py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                            {t("editTitle")}
                          </Button>
                          {p.status === "active" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                clear();
                                setRenewing(p);
                              }}
                            >
                              {t("renew")}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <PlanDialog
        slug={slug}
        currency={currency}
        target={editing}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={renewing !== null}
        title={renewing ? t("renewTitle", { name: renewing.name }) : ""}
        body={t("renewBody")}
        confirmLabel={t("renew")}
        pending={pending}
        error={errorText}
        onClose={() => setRenewing(null)}
        onConfirm={() => {
          if (renewing)
            run(
              () => renewPlanAction(slug, renewing.id),
              () => setRenewing(null),
            );
        }}
      />
    </section>
  );
}
