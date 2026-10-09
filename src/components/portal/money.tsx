import { getLocale, getTranslations } from "next-intl/server";
import type { BillingTotals } from "@/lib/billing/summary";
import type { Currency } from "@/lib/domain/business";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Value, paid and outstanding at a glance; overdue is highlighted only when non-zero. */
export async function BillingTotalsList({
  totals,
  currency,
}: {
  totals: BillingTotals;
  currency: Currency;
}) {
  const t = await getTranslations("portal.money");
  const locale = await getLocale();
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const rows = [
    { key: "value", text: totals.value === null ? t("notSet") : money(totals.value) },
    { key: "paid", text: money(totals.paid) },
    { key: "outstanding", text: money(totals.outstanding) },
  ] as const;
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {rows.map((row) => (
        <div key={row.key} className="rounded-lg border border-border bg-surface px-4 py-3">
          <dt className="text-sm text-muted-foreground">{t(row.key)}</dt>
          <dd className="mt-1 font-mono text-base break-words">{row.text}</dd>
        </div>
      ))}
      {totals.overdue > 0 ? (
        <div className="rounded-lg border border-error/50 bg-error/5 px-4 py-3 sm:col-span-3">
          <dt className="text-sm text-error">{t("overdue")}</dt>
          <dd className="mt-1 font-mono text-base text-error">{money(totals.overdue)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export async function InvoiceStatusBadge({ status }: { status: string }) {
  const t = await getTranslations("portal.invoices.status");
  const tone =
    status === "paid"
      ? "border-success/40 text-success"
      : status === "overdue"
        ? "border-error/50 text-error"
        : status === "partially_paid"
          ? "border-warning/40 text-warning"
          : "border-border-strong text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs whitespace-nowrap",
        tone,
      )}
    >
      {t.has(status as never) ? t(status as never) : status}
    </span>
  );
}
