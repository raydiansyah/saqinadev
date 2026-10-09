import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { orgPayments } from "@/lib/billing/summary";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatDay } from "./format";
import { PaymentStatusBadge } from "./status-badge";
import { DataTable, TD, TH } from "./table";

type PaymentRow = Awaited<ReturnType<typeof orgPayments>>[number];

/** Read-only ledger; voided payments stay visible but struck through. */
export async function PaymentTable({ payments }: { payments: PaymentRow[] }) {
  const t = await getTranslations("finance");
  const locale = await getLocale();
  return (
    <DataTable
      caption={t("payments.caption")}
      head={
        <tr>
          <th scope="col" className={TH}>
            {t("payments.date")}
          </th>
          <th scope="col" className={TH}>
            {t("payments.project")}
          </th>
          <th scope="col" className={TH}>
            {t("payments.invoice")}
          </th>
          <th scope="col" className={`${TH} text-right`}>
            {t("payments.amount")}
          </th>
          <th scope="col" className={TH}>
            {t("payments.method")}
          </th>
          <th scope="col" className={TH}>
            {t("payments.reference")}
          </th>
          <th scope="col" className={TH}>
            {t("payments.status")}
          </th>
        </tr>
      }
    >
      {payments.map((p) => {
        const voided = p.status === "void";
        return (
          <tr key={p.id} className={cn(voided && "text-subtle-foreground")}>
            <td className={cn(TD, "whitespace-nowrap", voided && "line-through")}>
              {formatDay(p.paidAt, locale)}
            </td>
            <td className={TD}>
              <Link
                href={`/project/${p.projectSlug}/billing`}
                className="underline-offset-4 hover:underline"
              >
                {p.projectName}
              </Link>
            </td>
            <td className={cn(TD, "whitespace-nowrap")}>
              {p.invoiceNumber ?? t("invoices.draftNumber")}
            </td>
            <td
              className={cn(
                TD,
                "text-right whitespace-nowrap tabular-nums",
                voided && "line-through",
              )}
            >
              {formatMoney(p.amount, p.currency, locale)}
            </td>
            <td className={cn(TD, "whitespace-nowrap")}>{t(`methods.${p.method}`)}</td>
            <td className={cn(TD, "max-w-48 truncate")}>{p.reference}</td>
            <td className={TD}>
              <PaymentStatusBadge status={p.status} />
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}
