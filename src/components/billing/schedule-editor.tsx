"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { setScheduleAction } from "@/app/[locale]/(app)/project/[slug]/billing/actions";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/ui/form";
import { resolveTermAmounts } from "@/lib/billing/rules";
import type { Currency } from "@/lib/domain/business";
import { formatMoney, formatPercent, fromMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BillingError } from "./billing-error";
import { formatDay, parseMajor } from "./format";

export interface TermView {
  id: string;
  label: string;
  percentBp: number | null;
  amount: number;
  dueDate: string | null;
  invoiceId: string | null;
}

interface Row {
  key: number;
  label: string;
  mode: "percent" | "fixed";
  percent: string;
  amount: string;
  dueDate: string;
}

const percentToBp = (raw: string) => {
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n * 100) : null;
};

let nextKey = 0;

/** Value and terms editor. Amounts are recomputed live with the same rules the server uses. */
export function ScheduleEditor({
  slug,
  currency,
  value,
  terms,
  canWrite,
}: {
  slug: string;
  currency: Currency;
  value: number | null;
  terms: TermView[];
  canWrite: boolean;
}) {
  const t = useTranslations("billing.schedule");
  const locale = useLocale();
  const id = useId();
  const { pending, error, run } = useRun();
  const locked = terms.filter((x) => x.invoiceId !== null);
  const lockedTotal = locked.reduce((a, x) => a + x.amount, 0);
  const money = (minor: number) => formatMoney(minor, currency, locale);

  const [valueText, setValueText] = useState(value ? String(fromMinor(value, currency)) : "");
  const [rows, setRows] = useState<Row[]>(() =>
    terms
      .filter((x) => x.invoiceId === null)
      .map((x) => ({
        key: nextKey++,
        label: x.label,
        mode: x.percentBp != null ? "percent" : "fixed",
        percent: x.percentBp != null ? String(x.percentBp / 100) : "",
        amount: x.percentBp != null ? "" : String(fromMinor(x.amount, currency)),
        dueDate: x.dueDate ?? "",
      })),
  );

  const valueMinor = parseMajor(valueText, currency);
  const inputs = rows.map((r) =>
    r.mode === "percent"
      ? { label: r.label, percentBp: percentToBp(r.percent), amount: null }
      : { label: r.label, percentBp: null, amount: parseMajor(r.amount, currency) },
  );
  const complete = inputs.every((x) => x.percentBp !== null || x.amount !== null);
  const resolved =
    valueMinor !== null && complete
      ? resolveTermAmounts(valueMinor, inputs, valueMinor - lockedTotal)
      : null;
  // Per-row preview even when the total does not match yet.
  const preview = inputs.map((x) =>
    x.percentBp !== null && valueMinor !== null
      ? Math.floor((valueMinor * x.percentBp) / 10_000)
      : x.amount,
  );
  const termsTotal = lockedTotal + preview.reduce<number>((a, b) => a + (b ?? 0), 0);
  const matches =
    valueMinor !== null &&
    (rows.length > 0 ? resolved !== null : lockedTotal === 0 || lockedTotal === valueMinor);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = () => {
    if (valueMinor === null) return;
    run(() =>
      setScheduleAction(slug, {
        value: valueMinor,
        terms: rows.map((r, i) => ({
          label: r.label.trim(),
          ...(inputs[i].percentBp !== null
            ? { percentBp: inputs[i].percentBp }
            : { amount: inputs[i].amount }),
          dueDate: r.dueDate || null,
        })),
      }),
    );
  };

  return (
    <section aria-labelledby={`${id}-schedule`} className="rounded-lg border border-border p-5">
      <h2 id={`${id}-schedule`} className="font-semibold">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>

      <form className="mt-5 space-y-4" action={() => submit()} aria-describedby={`${id}-check`}>
        <div className="max-w-xs">
          <label htmlFor={`${id}-value`} className="mb-1.5 block text-sm font-medium">
            {t("value", { currency })}
          </label>
          <input
            id={`${id}-value`}
            inputMode="decimal"
            value={valueText}
            onChange={(e) => setValueText(e.target.value)}
            disabled={!canWrite}
            required
            aria-invalid={valueText !== "" && valueMinor === null ? true : undefined}
            className={cn(FIELD_CLASS, "min-h-11 py-2.5 font-mono")}
          />
        </div>

        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("label")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("type")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("percent")} / {t("fixed")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("dueDate")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t("computed")}
                </th>
                <th scope="col" className="py-2">
                  <span className="sr-only">{t("remove")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {locked.map((x) => (
                <tr key={x.id} className="text-muted-foreground">
                  <td className="py-2 pr-3">{x.label}</td>
                  <td className="py-2 pr-3">
                    <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs">
                      {t("locked")}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono">
                    {x.percentBp != null ? formatPercent(x.percentBp) : "-"}
                  </td>
                  <td className="py-2 pr-3">{formatDay(x.dueDate, locale)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{money(x.amount)}</td>
                  <td />
                </tr>
              ))}
              {rows.map((r, i) => (
                <tr key={r.key}>
                  <td className="py-2 pr-3">
                    <input
                      aria-label={t("label")}
                      value={r.label}
                      placeholder={t("labelPlaceholder")}
                      maxLength={80}
                      required
                      disabled={!canWrite}
                      onChange={(e) => update(r.key, { label: e.target.value })}
                      className={cn(FIELD_CLASS, "min-h-10 py-2")}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      aria-label={t("type")}
                      value={r.mode}
                      disabled={!canWrite}
                      onChange={(e) => update(r.key, { mode: e.target.value as Row["mode"] })}
                      className={cn(FIELD_CLASS, "min-h-10 py-2")}
                    >
                      <option value="percent">{t("percent")}</option>
                      <option value="fixed">{t("fixed")}</option>
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    {r.mode === "percent" ? (
                      <div className="flex items-center gap-1">
                        <input
                          aria-label={t("percentValue")}
                          inputMode="decimal"
                          value={r.percent}
                          required
                          disabled={!canWrite}
                          onChange={(e) => update(r.key, { percent: e.target.value })}
                          className={cn(FIELD_CLASS, "min-h-10 w-24 py-2 font-mono")}
                        />
                        <span aria-hidden="true">%</span>
                      </div>
                    ) : (
                      <input
                        aria-label={t("amountValue", { currency })}
                        inputMode="decimal"
                        value={r.amount}
                        required
                        disabled={!canWrite}
                        onChange={(e) => update(r.key, { amount: e.target.value })}
                        className={cn(FIELD_CLASS, "min-h-10 w-36 py-2 font-mono")}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="date"
                      aria-label={t("dueDate")}
                      value={r.dueDate}
                      disabled={!canWrite}
                      onChange={(e) => update(r.key, { dueDate: e.target.value })}
                      className={cn(FIELD_CLASS, "min-h-10 py-2")}
                    />
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {resolved
                      ? money(resolved[i])
                      : preview[i] !== null
                        ? money(preview[i] as number)
                        : "-"}
                  </td>
                  <td className="py-2 text-right">
                    {canWrite ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`${t("remove")}: ${r.label}`}
                        onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
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
        {rows.length === 0 && locked.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : null}

        <div id={`${id}-check`} aria-live="polite" className="text-sm">
          {valueMinor !== null && (rows.length > 0 || locked.length > 0) ? (
            matches ? (
              <p className="text-success">{t("matches")}</p>
            ) : (
              <p className="text-warning">
                {t("mismatch", { total: money(termsTotal), value: money(valueMinor) })}
              </p>
            )
          ) : null}
        </div>

        {canWrite ? (
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setRows((list) => [
                  ...list,
                  {
                    key: nextKey++,
                    label: "",
                    mode: "percent",
                    percent: "",
                    amount: "",
                    dueDate: "",
                  },
                ])
              }
            >
              {t("add")}
            </Button>
            <Button type="submit" size="sm" disabled={pending || !matches}>
              {t("save")}
            </Button>
          </div>
        ) : null}
        <BillingError error={error} />
      </form>
    </section>
  );
}
