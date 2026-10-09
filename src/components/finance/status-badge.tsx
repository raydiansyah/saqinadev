import { getTranslations } from "next-intl/server";
import type { EffectiveInvoiceStatus, PaymentStatus } from "@/lib/domain/business";
import { cn } from "@/lib/utils";

const INVOICE_TONE: Record<EffectiveInvoiceStatus, string> = {
  draft: "border-border text-subtle-foreground",
  issued: "border-info/40 text-info",
  sent: "border-info/40 text-info",
  partially_paid: "border-warning/50 text-warning",
  paid: "border-success/40 text-success",
  cancelled: "border-border text-subtle-foreground",
  overdue: "border-error/50 text-error",
};

const BADGE = "inline-block rounded-md border px-1.5 py-0.5 text-xs whitespace-nowrap";

export async function InvoiceStatusBadge({ status }: { status: EffectiveInvoiceStatus }) {
  const t = await getTranslations("finance.invoiceStatuses");
  return <span className={cn(BADGE, INVOICE_TONE[status])}>{t(status)}</span>;
}

export async function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = await getTranslations("finance.paymentStatuses");
  return (
    <span
      className={cn(
        BADGE,
        status === "void"
          ? "border-border text-subtle-foreground"
          : "border-success/40 text-success",
      )}
    >
      {t(status)}
    </span>
  );
}
