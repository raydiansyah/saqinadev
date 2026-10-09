import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import { formatDay } from "@/components/portal/format";
import { InvoiceStatusBadge } from "@/components/portal/money";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { clientInvoices } from "@/lib/portal/views";
import { portalPageAccess } from "../../../access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.invoices");
  return { title: t("metaTitle") };
}

export default async function PortalInvoicesPage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/invoices">) {
  const { slug } = await params;
  const invoices = await clientInvoices(await portalPageAccess(slug));
  const [t, locale] = await Promise.all([getTranslations("portal.invoices"), getLocale()]);
  const th = "px-4 py-2 text-left font-normal text-muted-foreground";
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </div>
      {invoices.length === 0 ? (
        <EmptyState title={t("title")} body={t("empty")} />
      ) : (
        <div className="relative overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">{t("tableLabel")}</caption>
            <thead className="border-b border-border">
              <tr>
                <th scope="col" className={th}>
                  {t("columns.number")}
                </th>
                <th scope="col" className={th}>
                  {t("columns.issued")}
                </th>
                <th scope="col" className={th}>
                  {t("columns.due")}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t("columns.total")}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t("columns.balance")}
                </th>
                <th scope="col" className={th}>
                  {t("columns.status")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((inv) => {
                const number = inv.number ?? t("pendingNumber");
                return (
                  <tr key={inv.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/portal/projects/${slug}/invoices/${inv.id}`}
                        aria-label={t("view", { number })}
                        className="font-mono underline-offset-4 hover:underline"
                      >
                        {number}
                      </Link>
                      <p className="max-w-56 truncate text-muted-foreground">{inv.title}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDay(inv.issueDate, locale) ?? t("noDate")}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDay(inv.dueDate, locale) ?? t("noDate")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                      {formatMoney(inv.total, inv.currency, locale)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                      {formatMoney(inv.balance, inv.currency, locale)}
                    </td>
                    <td className="px-4 py-3">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
