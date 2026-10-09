import { useTranslations } from "next-intl";
import type { EffectiveInvoiceStatus } from "@/lib/domain/business";
import { cn } from "@/lib/utils";

const TONE: Record<EffectiveInvoiceStatus, string> = {
  draft: "border-border text-muted-foreground",
  issued: "border-info/40 text-info",
  sent: "border-info/40 text-info",
  partially_paid: "border-warning/50 text-warning",
  paid: "border-success/40 text-success",
  cancelled: "border-border text-subtle-foreground line-through",
  overdue: "border-error/50 text-error",
};

export function StatusChip({ status }: { status: EffectiveInvoiceStatus }) {
  const t = useTranslations("billing.statuses");
  return (
    <span
      className={cn(
        "inline-block rounded-sm border px-1.5 py-0.5 font-mono text-xs whitespace-nowrap",
        TONE[status],
      )}
    >
      {t(status)}
    </span>
  );
}
