import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDay } from "@/components/portal/format";
import { InvoiceStatusBadge } from "@/components/portal/money";
import { PrintButton } from "@/components/portal/print-button";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { clientInvoice } from "@/lib/portal/views";
import { orNotFound, portalPageAccess, portalProjectView } from "../../../../access";

async function load(slug: string, id: string) {
  return orNotFound(clientInvoice(await portalPageAccess(slug), id));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/invoices/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const [{ invoice }, t] = await Promise.all([load(slug, id), getTranslations("portal.invoices")]);
  return { title: t("heading", { number: invoice.number ?? t("pendingNumber") }) };
}

export default async function PortalInvoicePage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/invoices/[id]">) {
  const { slug, id } = await params;
  const [{ invoice, items }, view, t, locale] = await Promise.all([
    load(slug, id),
    portalProjectView(slug),
    getTranslations("portal.invoices"),
    getLocale(),
  ]);
  const money = (minor: number) => formatMoney(minor, invoice.currency, locale);
  const number = invoice.number ?? t("pendingNumber");
  const th = "px-4 py-2 font-normal text-muted-foreground print:px-2";

  return (
    <article className="print:text-black">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/portal/projects/${slug}/invoices`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden="true">←</span> {t("back")}
        </Link>
        <PrintButton label={t("print")} />
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 sm:p-8 print:border-0 print:bg-transparent print:p-0">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold break-words">{t("heading", { number })}</h2>
            <p className="mt-1 break-words text-muted-foreground print:text-black">
              {invoice.title}
            </p>
          </div>
          <InvoiceStatusBadge status={invoice.status} />
        </header>

        <dl className="grid gap-4 py-6 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t("billedTo")}</dt>
            <dd className="mt-0.5 break-words">{view.clientName}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t("project")}</dt>
            <dd className="mt-0.5 break-words">{view.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("issueDate")}</dt>
            <dd className="mt-0.5">{formatDay(invoice.issueDate, locale) ?? t("noDate")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("dueDate")}</dt>
            <dd className="mt-0.5">{formatDay(invoice.dueDate, locale) ?? t("noDate")}</dd>
          </div>
        </dl>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("items.empty")}</p>
        ) : (
          <div className="relative overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[32rem] text-sm print:min-w-0">
              <caption className="sr-only">{t("items.label")}</caption>
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className={`${th} pl-0 text-left`}>
                    {t("items.description")}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t("items.quantity")}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t("items.unit")}
                  </th>
                  <th scope="col" className={`${th} pr-0 text-right`}>
                    {t("items.amount")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: line items have no public id
                  <tr key={i}>
                    <td className="py-3 pr-4 break-words">{item.description}</td>
                    <td className="px-4 py-3 text-right font-mono print:px-2">{item.quantity}</td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap print:px-2">
                      {money(item.unitAmount)}
                    </td>
                    <td className="py-3 pl-4 text-right font-mono whitespace-nowrap">
                      {money(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <dl className="mt-6 ml-auto max-w-xs space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("total")}</dt>
            <dd className="font-mono">{money(invoice.total)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("paid")}</dt>
            <dd className="font-mono">{money(invoice.amountPaid)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-base font-semibold">
            <dt>{t("balance")}</dt>
            <dd className="font-mono">{money(invoice.balance)}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
