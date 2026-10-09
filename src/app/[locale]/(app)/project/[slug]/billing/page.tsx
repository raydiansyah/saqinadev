import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { InvoicesPanel } from "@/components/billing/invoices-panel";
import { LedgerTable } from "@/components/billing/ledger-table";
import { ScheduleEditor } from "@/components/billing/schedule-editor";
import { Notice } from "@/components/ui/form";
import { can } from "@/lib/auth/permissions";
import { projectBilling } from "@/lib/billing/summary";
import { formatMoney } from "@/lib/money";
import { projectPageAccess } from "@/lib/projects/page";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function BillingPage({
  params,
}: PageProps<"/[locale]/project/[slug]/billing">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const [t, locale] = await Promise.all([getTranslations("billing"), getLocale()]);

  if (!can(access.role, "billing:read"))
    return (
      <>
        <PageHeading title={t("title")} />
        <Notice tone="info">{t("restricted")}</Notice>
      </>
    );

  const billing = await projectBilling(access.project);
  const { currency, totals } = billing;
  const canWrite = can(access.role, "billing:write");
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const terms = billing.terms.map((x) => ({
    id: x.id,
    label: x.label,
    percentBp: x.percentBp,
    amount: x.amount,
    dueDate: x.dueDate,
    invoiceId: x.invoiceId,
  }));
  const cards = [
    {
      key: "value",
      label: t("summary.value"),
      value: totals.value === null ? t("summary.notSet") : money(totals.value),
      note:
        totals.uninvoiced !== null && totals.uninvoiced > 0
          ? t("summary.uninvoiced", { amount: money(totals.uninvoiced) })
          : null,
      tone: "",
    },
    { key: "paid", label: t("summary.paid"), value: money(totals.paid), note: null, tone: "" },
    {
      key: "outstanding",
      label: t("summary.outstanding"),
      value: money(totals.outstanding),
      note: null,
      tone: "",
    },
    {
      key: "overdue",
      label: t("summary.overdue"),
      value: money(totals.overdue),
      note: null,
      tone: totals.overdue > 0 ? "text-error" : "",
    },
  ];

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c) => (
            <div key={c.key} className="min-w-0 rounded-lg border border-border p-4">
              <dt className="text-xs text-muted-foreground">{c.label}</dt>
              <dd className={cn("mt-1 font-mono text-lg font-semibold break-words", c.tone)}>
                {c.value}
              </dd>
              {c.note ? <dd className="mt-1 text-xs text-subtle-foreground">{c.note}</dd> : null}
            </div>
          ))}
        </dl>
        <ScheduleEditor
          // Remount when the stored schedule changes, so the form starts from the saved state.
          key={`${totals.value}:${terms.map((x) => `${x.id}${x.invoiceId ?? ""}`).join()}`}
          slug={slug}
          currency={currency}
          value={totals.value}
          terms={terms}
          canWrite={canWrite}
        />
        <InvoicesPanel
          slug={slug}
          currency={currency}
          invoices={billing.invoices.map((i) => ({
            id: i.id,
            number: i.number,
            title: i.title,
            status: i.status,
            dueDate: i.dueDate,
            total: i.total,
            balance: i.balance,
          }))}
          terms={terms}
          canWrite={canWrite}
        />
        <LedgerTable slug={slug} currency={currency} ledger={billing.ledger} canWrite={canWrite} />
      </div>
    </>
  );
}
