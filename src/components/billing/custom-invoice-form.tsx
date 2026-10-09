"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { createInvoiceAction } from "@/app/[locale]/(app)/project/[slug]/billing/actions";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS, Field, TextArea } from "@/components/ui/form";
import type { Currency } from "@/lib/domain/business";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BillingError } from "./billing-error";
import { parseMajor } from "./format";

interface Line {
  key: number;
  description: string;
  quantity: string;
  unit: string;
}

let nextKey = 0;
const blank = (): Line => ({ key: nextKey++, description: "", quantity: "1", unit: "" });

/** Draft invoice with free line items, for work outside the payment schedule. */
export function CustomInvoiceForm({ slug, currency }: { slug: string; currency: Currency }) {
  const t = useTranslations("billing.custom");
  const states = useTranslations("app.states");
  const locale = useLocale();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>(() => [blank()]);
  const { pending, error, run } = useRun();

  const parsed = lines.map((l) => {
    const quantity = Number.parseInt(l.quantity, 10);
    const unitAmount = parseMajor(l.unit, currency);
    return {
      description: l.description.trim(),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
      unitAmount: unitAmount ?? 0,
    };
  });
  const total = parsed.reduce((a, l) => a + l.quantity * l.unitAmount, 0);
  const update = (key: number, patch: Partial<Line>) =>
    setLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  if (!open)
    return (
      <div className="mt-5">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {t("open")}
        </Button>
      </div>
    );

  return (
    <form
      aria-labelledby={`${id}-custom`}
      className="mt-6 space-y-4 rounded-md border border-border p-4"
      action={(form) =>
        run(
          () =>
            createInvoiceAction(slug, {
              title: String(form.get("title") ?? ""),
              items: parsed,
              dueDate: String(form.get("dueDate") ?? "") || null,
              notes: String(form.get("notes") ?? ""),
            }),
          () => {
            setLines([blank()]);
            setOpen(false);
          },
        )
      }
    >
      <div>
        <h3 id={`${id}-custom`} className="text-sm font-medium">
          {t("title")}
        </h3>
        <p className="mt-1 text-xs text-subtle-foreground">{t("hint")}</p>
      </div>
      <Field
        id={`${id}-title`}
        name="title"
        label={t("invoiceTitle")}
        required
        minLength={2}
        maxLength={160}
      />
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="py-2 pr-2 font-medium">
                {t("description")}
              </th>
              <th scope="col" className="py-2 pr-2 font-medium">
                {t("quantity")}
              </th>
              <th scope="col" className="py-2 pr-2 font-medium">
                {t("unitPrice", { currency })}
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-medium">
                {t("lineTotal")}
              </th>
              <th scope="col" className="py-2">
                <span className="sr-only">{t("removeLine")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key}>
                <td className="py-1 pr-2">
                  <input
                    aria-label={t("description")}
                    value={l.description}
                    required
                    maxLength={300}
                    onChange={(e) => update(l.key, { description: e.target.value })}
                    className={cn(FIELD_CLASS, "min-h-10 py-2")}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label={t("quantity")}
                    type="number"
                    min={1}
                    max={10000}
                    step={1}
                    value={l.quantity}
                    required
                    onChange={(e) => update(l.key, { quantity: e.target.value })}
                    className={cn(FIELD_CLASS, "min-h-10 w-20 py-2 font-mono")}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label={t("unitPrice", { currency })}
                    inputMode="decimal"
                    value={l.unit}
                    required
                    onChange={(e) => update(l.key, { unit: e.target.value })}
                    className={cn(FIELD_CLASS, "min-h-10 w-36 py-2 font-mono")}
                  />
                </td>
                <td className="py-1 pr-2 text-right font-mono whitespace-nowrap">
                  {formatMoney(parsed[i].quantity * parsed[i].unitAmount, currency, locale)}
                </td>
                <td className="py-1 text-right">
                  {lines.length > 1 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t("removeLine")}
                      onClick={() => setLines((list) => list.filter((x) => x.key !== l.key))}
                    >
                      ×
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={lines.length >= 50}
          onClick={() => setLines((list) => [...list, blank()])}
        >
          {t("addLine")}
        </Button>
        <p className="text-sm">
          {t("total")}:{" "}
          <span className="font-mono font-medium">{formatMoney(total, currency, locale)}</span>
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-due`} name="dueDate" type="date" label={t("dueDate")} />
      </div>
      <TextArea id={`${id}-notes`} name="notes" label={t("notes")} rows={2} maxLength={2000} />
      <BillingError error={error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {states("cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending || total <= 0}>
          {t("create")}
        </Button>
      </div>
    </form>
  );
}
