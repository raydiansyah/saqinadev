import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import { formatDay } from "@/components/portal/format";
import { formatMoney } from "@/lib/money";
import { clientPayments } from "@/lib/portal/views";
import { portalPageAccess, portalProjectView } from "../../../access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.payments");
  return { title: t("metaTitle") };
}

export default async function PortalPaymentsPage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/payments">) {
  const { slug } = await params;
  const [payments, view, t, locale] = await Promise.all([
    portalPageAccess(slug).then(clientPayments),
    portalProjectView(slug),
    getTranslations("portal"),
    getLocale(),
  ]);
  const th = "px-4 py-2 text-left font-normal text-muted-foreground";
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("payments.title")}</h2>
        <p className="mt-1 text-muted-foreground">{t("payments.description")}</p>
      </div>
      {payments.length === 0 ? (
        <EmptyState title={t("payments.title")} body={t("payments.empty")} />
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface px-4 py-3">
              <dt className="text-sm text-muted-foreground">{t("payments.totalPaid")}</dt>
              <dd className="mt-1 font-mono">
                {formatMoney(view.totals.paid, view.currency, locale)}
              </dd>
              <dd className="mt-1 text-xs text-muted-foreground">
                {t("payments.summary", { count: payments.length })}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-surface px-4 py-3">
              <dt className="text-sm text-muted-foreground">{t("money.outstanding")}</dt>
              <dd className="mt-1 font-mono">
                {formatMoney(view.totals.outstanding, view.currency, locale)}
              </dd>
            </div>
            {view.totals.overdue > 0 ? (
              <div className="rounded-lg border border-error/50 bg-error/5 px-4 py-3">
                <dt className="text-sm text-error">{t("money.overdue")}</dt>
                <dd className="mt-1 font-mono text-error">
                  {formatMoney(view.totals.overdue, view.currency, locale)}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="relative overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[30rem] text-sm">
              <caption className="sr-only">{t("payments.tableLabel")}</caption>
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className={th}>
                    {t("payments.columns.date")}
                  </th>
                  <th scope="col" className={th}>
                    {t("payments.columns.invoice")}
                  </th>
                  <th scope="col" className={th}>
                    {t("payments.columns.method")}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t("payments.columns.amount")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: payments expose no public id
                  <tr key={i}>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDay(p.paidAt, locale)}</td>
                    <td className="px-4 py-3 font-mono">
                      {p.invoiceNumber ?? t("invoices.pendingNumber")}
                    </td>
                    <td className="px-4 py-3">{t(`payments.method.${p.method}`)}</td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                      {formatMoney(p.amount, p.currency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
