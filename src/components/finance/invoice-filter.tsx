import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export const INVOICE_FILTERS = ["all", "open", "overdue", "paid", "draft"] as const;
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number];

export const parseInvoiceFilter = (value: unknown): InvoiceFilter =>
  INVOICE_FILTERS.includes(value as InvoiceFilter) ? (value as InvoiceFilter) : "all";

export async function InvoiceFilterNav({ current }: { current: InvoiceFilter }) {
  const t = await getTranslations("finance.invoices");
  return (
    <nav aria-label={t("filterLabel")} className="mb-4 flex flex-wrap gap-2">
      {INVOICE_FILTERS.map((f) => (
        <Link
          key={f}
          href={f === "all" ? "/dashboard/invoices" : `/dashboard/invoices?status=${f}`}
          aria-current={f === current ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-md border px-3 text-sm sm:min-h-9",
            f === current
              ? "border-primary/60 bg-surface-raised text-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`filters.${f}`)}
        </Link>
      ))}
    </nav>
  );
}
