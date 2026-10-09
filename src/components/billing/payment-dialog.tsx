"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { recordPaymentAction } from "@/app/[locale]/(app)/project/[slug]/billing/actions";
import { Dialog } from "@/components/app/dialog";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { type Currency, PAYMENT_METHODS } from "@/lib/domain/business";
import { formatMoney, fromMinor } from "@/lib/money";
import { BillingError } from "./billing-error";
import { localToday, parseMajor } from "./format";

export interface PayTarget {
  id: string;
  label: string;
  balance: number;
}

/** Records money already received. The amount starts at the balance due. */
export function PaymentDialog({
  slug,
  currency,
  target,
  onClose,
}: {
  slug: string;
  currency: Currency;
  target: PayTarget | null;
  onClose: () => void;
}) {
  const t = useTranslations("billing.payment");
  const methods = useTranslations("billing.methods");
  const states = useTranslations("app.states");
  const locale = useLocale();
  const id = useId();
  const { pending, error, run, clear } = useRun();
  const close = () => {
    clear();
    onClose();
  };

  return (
    <Dialog open={target !== null} onClose={close} title={t("title")} description={t("hint")}>
      {target ? (
        <form
          // Remount per invoice so the defaults follow the selected balance.
          key={target.id}
          className="space-y-4"
          action={(form) => {
            const amount = parseMajor(String(form.get("amount") ?? ""), currency);
            run(
              () =>
                recordPaymentAction(slug, target.id, {
                  amount: amount ?? 0,
                  paidAt: String(form.get("paidAt") ?? ""),
                  method: String(form.get("method") ?? ""),
                  reference: String(form.get("reference") ?? ""),
                }),
              close,
            );
          }}
        >
          <p className="text-sm text-muted-foreground">
            {t("invoice", {
              invoice: target.label,
              balance: formatMoney(target.balance, currency, locale),
            })}
          </p>
          <Field
            id={`${id}-amount`}
            name="amount"
            label={t("amount", { currency })}
            inputMode="decimal"
            defaultValue={String(fromMinor(target.balance, currency))}
            required
            className="font-mono"
          />
          <Field
            id={`${id}-date`}
            name="paidAt"
            type="date"
            label={t("paidAt")}
            defaultValue={localToday()}
            max={localToday()}
            required
          />
          <Select
            id={`${id}-method`}
            name="method"
            label={t("method")}
            defaultValue="bank_transfer"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {methods(m)}
              </option>
            ))}
          </Select>
          <Field
            id={`${id}-reference`}
            name="reference"
            label={t("reference")}
            placeholder={t("referencePlaceholder")}
            maxLength={200}
          />
          <BillingError error={error} />
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close}>
              {states("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}
