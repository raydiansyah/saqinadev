import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { OrgInvoiceRow } from "@/lib/billing/summary";
import { formatMoney } from "@/lib/money";
import { formatDay } from "./format";
import { InvoiceStatusBadge } from "./status-badge";
import { DataTable, TD, TH } from "./table";

export async function InvoiceTable({ invoices }: { invoices: OrgInvoiceRow[] }) {
  const t = await getTranslations("finance.invoices");
  const locale = await getLocale();
  return (
    <DataTable
      caption={t("caption")}
      head={
        <tr>
          <th scope="col" className={TH}>
            {t("invoice")}
          </th>
          <th scope="col" className={TH}>
            {t("project")}
          </th>
          <th scope="col" className={TH}>
            {t("status")}
          </th>
          <th scope="col" className={TH}>
            {t("due")}
          </th>
          <th scope="col" className={`${TH} text-right`}>
            {t("total")}
          </th>
          <th scope="col" className={`${TH} text-right`}>
            {t("balance")}
          </th>
        </tr>
      }
    >
      {invoices.map((i) => (
        <tr key={i.id}>
          <td className={TD}>
            <Link
              href={`/project/${i.projectSlug}/billing/invoices/${i.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {i.number ?? t("draftNumber")}
            </Link>
            <p className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground">{i.title}</p>
          </td>
          <td className={TD}>
            <Link
              href={`/project/${i.projectSlug}/billing`}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {i.projectName}
            </Link>
          </td>
          <td className={TD}>
            <InvoiceStatusBadge status={i.status} />
          </td>
          <td className={`${TD} whitespace-nowrap text-muted-foreground`}>
            {formatDay(i.dueDate, locale)}
          </td>
          <td className={`${TD} text-right whitespace-nowrap tabular-nums`}>
            {formatMoney(i.total, i.currency, locale)}
          </td>
          <td className={`${TD} text-right whitespace-nowrap tabular-nums`}>
            {formatMoney(i.balance, i.currency, locale)}
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
