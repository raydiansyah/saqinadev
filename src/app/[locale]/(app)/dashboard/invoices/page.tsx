import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import {
  type InvoiceFilter,
  InvoiceFilterNav,
  parseInvoiceFilter,
} from "@/components/finance/invoice-filter";
import { InvoiceTable } from "@/components/finance/invoice-table";
import { orgPageAccess } from "@/components/finance/page-access";
import { requireActorPage } from "@/lib/auth/server";
import { type OrgInvoiceRow, orgBilling } from "@/lib/billing/summary";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("finance.invoices");
  return { title: t("metaTitle"), robots: { index: false } };
}

const OPEN = new Set(["issued", "sent", "partially_paid", "overdue"]);

function matches(row: OrgInvoiceRow, filter: InvoiceFilter): boolean {
  switch (filter) {
    case "open":
      return OPEN.has(row.status);
    case "all":
      return true;
    default:
      return row.status === filter;
  }
}

export default async function InvoicesPage({
  searchParams,
}: PageProps<"/[locale]/dashboard/invoices">) {
  const actor = await requireActorPage("/dashboard/invoices");
  const { org } = await orgPageAccess(actor, "billing:read");
  const filter = parseInvoiceFilter((await searchParams).status);
  const [{ invoices }, t] = await Promise.all([
    orgBilling(org.id),
    getTranslations("finance.invoices"),
  ]);
  const rows = invoices.filter((i) => matches(i, filter));

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <InvoiceFilterNav current={filter} />
      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <InvoiceTable invoices={rows} />
      )}
    </>
  );
}
