"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { voidPaymentAction } from "@/app/[locale]/(app)/project/[slug]/billing/actions";
import { Dialog } from "@/components/app/dialog";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import type { LedgerEntry } from "@/lib/billing/summary";
import type { Currency } from "@/lib/domain/business";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BillingError } from "./billing-error";
import { formatDay } from "./format";

/** Payment history. Voided rows stay, struck through, with their reason. */
export function LedgerTable({
  slug,
  currency,
  ledger,
  canWrite,
}: {
  slug: string;
  currency: Currency;
  ledger: LedgerEntry[];
  canWrite: boolean;
}) {
  const t = useTranslations("billing.ledger");
  const methods = useTranslations("billing.methods");
  const draft = useTranslations("billing.invoices");
  const states = useTranslations("app.states");
  const locale = useLocale();
  const id = useId();
  const [voiding, setVoiding] = useState<LedgerEntry | null>(null);
  const { pending, error, run, clear } = useRun();
  const close = () => {
    clear();
    setVoiding(null);
  };

  return (
    <section aria-labelledby={`${id}-ledger`} className="rounded-lg border border-border p-5">
      <h2 id={`${id}-ledger`} className="font-semibold">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      {ledger.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("date")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("invoice")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t("amount")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("method")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("reference")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("status")}
                </th>
                <th scope="col" className="py-2">
                  <span className="sr-only">{t("void")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ledger.map((p) => {
                const voided = p.status === "void";
                return (
                  <tr key={p.id} className={cn(voided && "text-subtle-foreground")}>
                    <td className={cn("py-2 pr-3 whitespace-nowrap", voided && "line-through")}>
                      {formatDay(p.paidAt, locale)}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs">{p.invoiceNumber ?? draft("draft")}</span>
                      <span className="ml-2 text-muted-foreground">{p.invoiceTitle}</span>
                    </td>
                    <td
                      className={cn(
                        "py-2 pr-3 text-right font-mono whitespace-nowrap",
                        voided && "line-through",
                      )}
                    >
                      {formatMoney(p.amount, currency, locale)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{methods(p.method)}</td>
                    <td className="max-w-48 truncate py-2 pr-3 font-mono text-xs">
                      {p.reference || "-"}
                    </td>
                    <td className="py-2 pr-3">
                      {voided ? (
                        <span>
                          <span className="font-mono text-xs text-error">{t("voided")}</span>
                          {p.voidReason ? (
                            <span className="block text-xs">
                              {t("voidReason", { reason: p.voidReason })}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-success">{t("confirmed")}</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {canWrite && !voided ? (
                        <Button size="sm" variant="ghost" onClick={() => setVoiding(p)}>
                          {t("void")}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={voiding !== null} onClose={close} title={t("voidTitle")}>
        {voiding ? (
          <form
            key={voiding.id}
            className="space-y-4"
            action={(form) =>
              run(
                () =>
                  voidPaymentAction(slug, voiding.id, { reason: String(form.get("reason") ?? "") }),
                close,
              )
            }
          >
            <p className="text-sm text-muted-foreground">
              <span className="font-mono text-foreground">
                {formatMoney(voiding.amount, currency, locale)} ·{" "}
                {formatDay(voiding.paidAt, locale)}
              </span>
              <span className="mt-2 block">{t("voidBody")}</span>
            </p>
            <Field
              id={`${id}-reason`}
              name="reason"
              label={t("reason")}
              placeholder={t("reasonPlaceholder")}
              required
              minLength={3}
              maxLength={300}
            />
            <BillingError error={error} />
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={close}>
                {states("cancel")}
              </Button>
              <Button type="submit" variant="danger" disabled={pending}>
                {t("voidConfirm")}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </section>
  );
}
