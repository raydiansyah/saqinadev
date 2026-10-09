import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import * as z from "zod";
import { formatDay } from "@/components/billing/format";
import { PrintButton } from "@/components/billing/print-button";
import { StatusChip } from "@/components/billing/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getInvoiceItems } from "@/lib/billing/invoices";
import { toInvoiceRow } from "@/lib/billing/summary";
import { db } from "@/lib/db/client";
import { clients, invoices, organizations } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing.detail");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Printable invoice. Only members with billing access reach it; others get the 404 page. */
export default async function InvoiceDetailPage({
  params,
}: PageProps<"/[locale]/project/[slug]/billing/invoices/[id]">) {
  const { slug, id } = await params;
  const { project } = await projectPageAccess(slug, "billing:read");
  if (!z.uuid().safeParse(id).success) notFound();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.projectId, project.id)))
    .limit(1);
  if (!invoice) notFound();

  const clientId = invoice.clientId ?? project.clientId;
  const [items, [org], client, t, locale] = await Promise.all([
    getInvoiceItems(invoice.id),
    db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, invoice.organizationId))
      .limit(1),
    clientId
      ? db
          .select({ name: clients.name, company: clients.company, address: clients.address })
          .from(clients)
          .where(and(eq(clients.id, clientId), eq(clients.organizationId, invoice.organizationId)))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : null,
    getTranslations("billing.detail"),
    getLocale(),
  ]);
  const row = toInvoiceRow(invoice);
  const money = (minor: number) => formatMoney(minor, invoice.currency, locale);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/project/${slug}/billing`}
          className={buttonVariants({ size: "sm", variant: "ghost" })}
        >
          {t("back")}
        </Link>
        <PrintButton label={t("print")} />
      </div>

      {row.status === "draft" ? (
        <p className="mb-4 rounded-md border border-warning/50 px-4 py-3 text-sm text-warning print:hidden">
          {t("draftNote")}
        </p>
      ) : null}

      <article className="rounded-lg border border-border p-6 sm:p-8 print:border-0 print:p-0 print:text-black">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground print:text-black">{t("invoice")}</p>
            <h1 className="mt-1 font-mono text-xl font-semibold break-all">
              {invoice.number ?? t("draftNumber")}
            </h1>
            <p className="mt-1 text-muted-foreground print:text-black">{invoice.title}</p>
          </div>
          <div className="print:hidden">
            <StatusChip status={row.status} />
          </div>
        </header>

        <dl className="grid gap-4 border-b border-border py-6 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground print:text-black">{t("from")}</dt>
            <dd className="mt-1 font-medium">{org?.name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground print:text-black">{t("billedTo")}</dt>
            <dd className="mt-1">
              {client ? (
                <>
                  <span className="block font-medium">{client.name}</span>
                  {client.company ? <span className="block">{client.company}</span> : null}
                  {client.address ? (
                    <span className="block whitespace-pre-line text-muted-foreground print:text-black">
                      {client.address}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">{t("noClient")}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground print:text-black">{t("project")}</dt>
            <dd className="mt-1">{project.name}</dd>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-muted-foreground print:text-black">{t("issued")}</dt>
              <dd className="mt-1">{formatDay(invoice.issueDate, locale)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground print:text-black">{t("due")}</dt>
              <dd className="mt-1">{formatDay(invoice.dueDate, locale)}</dd>
            </div>
          </div>
        </dl>

        <div className="relative overflow-x-auto py-6">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground print:text-black">
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("description")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t("quantity")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t("unitPrice")}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t("amount")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-3">{item.description}</td>
                  <td className="py-2 pr-3 text-right font-mono">{item.quantity}</td>
                  <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">
                    {money(item.unitAmount)}
                  </td>
                  <td className="py-2 text-right font-mono whitespace-nowrap">
                    {money(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto max-w-xs space-y-1 border-t border-border pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt>{t("total")}</dt>
            <dd className="font-mono font-semibold">{money(invoice.total)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{t("paid")}</dt>
            <dd className="font-mono">{money(invoice.amountPaid)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-1">
            <dt className="font-medium">{t("balance")}</dt>
            <dd className="font-mono font-semibold">{money(row.balance)}</dd>
          </div>
        </dl>

        {invoice.notes ? (
          <div className="mt-6 border-t border-border pt-4 text-sm">
            <p className="text-xs text-muted-foreground print:text-black">{t("notes")}</p>
            <p className="mt-1 whitespace-pre-line">{invoice.notes}</p>
          </div>
        ) : null}
      </article>
    </div>
  );
}
