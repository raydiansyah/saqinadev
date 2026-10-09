import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Actor } from "@/lib/auth/actor";
import { orgBilling } from "@/lib/billing/summary";
import type { Currency } from "@/lib/domain/business";
import { formatMoney } from "@/lib/money";
import { activeOrg, canOrg } from "@/lib/organizations/service";
import { cn } from "@/lib/utils";

export interface CurrencyTotals {
  currency: Currency;
  outstanding: number;
  overdue: number;
  paidThisMonth: number;
}

/** Outstanding, overdue and paid-this-month figures, one row per currency (never summed). */
export async function FinanceSummary({ totals }: { totals: CurrencyTotals[] }) {
  if (totals.length === 0) return null;
  const t = await getTranslations("finance.summary");
  const locale = await getLocale();
  const metrics = [
    { key: "outstanding", tone: "" },
    { key: "overdue", tone: "text-error" },
    { key: "paidThisMonth", tone: "text-success" },
  ] as const;

  return (
    <section aria-labelledby="finance-heading">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="finance-heading" className="font-medium">
          {t("title")}
        </h2>
        <div className="flex gap-4 text-sm">
          <Link
            href="/dashboard/invoices"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("viewInvoices")}
          </Link>
          <Link
            href="/dashboard/payments"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("viewPayments")}
          </Link>
        </div>
      </div>
      <div className="space-y-3">
        {totals.map((row) => (
          <dl
            key={row.currency}
            className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3"
          >
            {metrics.map((m) => (
              <div key={m.key} className="min-w-0">
                <dt className="text-xs text-muted-foreground">
                  {t(m.key)}
                  {totals.length > 1 ? ` (${row.currency})` : ""}
                </dt>
                <dd
                  className={cn(
                    "mt-1 truncate text-lg font-semibold tabular-nums",
                    row[m.key] > 0 ? m.tone : "",
                  )}
                >
                  {formatMoney(row[m.key], row.currency, locale)}
                </dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
    </section>
  );
}

/** Dashboard entry point: resolves the active organization and hides itself without access. */
export async function DashboardFinance({ actor }: { actor: Actor }) {
  const { org, role } = await activeOrg(actor);
  if (!canOrg(role, "billing:read")) return null;
  const { totals } = await orgBilling(org.id);
  return <FinanceSummary totals={totals} />;
}
