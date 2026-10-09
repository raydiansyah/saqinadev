"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  createInvoiceAction,
  transitionInvoiceAction,
} from "@/app/[locale]/(app)/project/[slug]/billing/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useRun } from "@/components/platform/use-run";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Currency, EffectiveInvoiceStatus } from "@/lib/domain/business";
import { formatMoney, formatPercent } from "@/lib/money";
import { BillingError, useBillingErrorText } from "./billing-error";
import { CustomInvoiceForm } from "./custom-invoice-form";
import { formatDay } from "./format";
import { PaymentDialog, type PayTarget } from "./payment-dialog";
import type { TermView } from "./schedule-editor";
import { StatusChip } from "./status-chip";

export interface InvoiceView {
  id: string;
  number: string | null;
  title: string;
  status: EffectiveInvoiceStatus;
  dueDate: string | null;
  total: number;
  balance: number;
}

const OPEN: EffectiveInvoiceStatus[] = ["issued", "sent", "partially_paid", "overdue"];

/** Terms ready to invoice, the invoice list with its lifecycle actions, and custom invoices. */
export function InvoicesPanel({
  slug,
  currency,
  invoices,
  terms,
  canWrite,
}: {
  slug: string;
  currency: Currency;
  invoices: InvoiceView[];
  terms: TermView[];
  canWrite: boolean;
}) {
  const t = useTranslations("billing.invoices");
  const tt = useTranslations("billing.terms");
  const locale = useLocale();
  const id = useId();
  const { pending, error, run, clear } = useRun();
  const errorText = useBillingErrorText(error);
  const [cancelling, setCancelling] = useState<InvoiceView | null>(null);
  const [paying, setPaying] = useState<PayTarget | null>(null);
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const ready = terms.filter((x) => x.invoiceId === null);
  const name = (i: InvoiceView) => i.number ?? t("draft");

  return (
    <section aria-labelledby={`${id}-invoices`} className="rounded-lg border border-border p-5">
      <h2 id={`${id}-invoices`} className="font-semibold">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>

      {canWrite && ready.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-medium">{tt("title")}</h3>
          <p className="mt-1 text-xs text-subtle-foreground">{tt("hint")}</p>
          <ul className="mt-3 divide-y divide-border rounded-md border border-border">
            {ready.map((term) => (
              <li key={term.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{term.label}</span>
                  {term.percentBp != null ? (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {formatPercent(term.percentBp)}
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-sm">{money(term.amount)}</span>
                <span className="text-xs text-muted-foreground">
                  {term.dueDate ? formatDay(term.dueDate, locale) : tt("noDue")}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => createInvoiceAction(slug, { termId: term.id }))}
                >
                  {tt("create")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {invoices.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="relative mt-5 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("number")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("invoiceTitle")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("status")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("due")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t("total")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t("balance")}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{name(inv)}</td>
                  <td className="max-w-56 truncate py-2 pr-3">{inv.title}</td>
                  <td className="py-2 pr-3">
                    <StatusChip status={inv.status} />
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatDay(inv.dueDate, locale)}</td>
                  <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">
                    {money(inv.total)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">
                    {inv.status === "cancelled" || inv.status === "draft"
                      ? "-"
                      : money(inv.balance)}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      {canWrite && inv.status === "draft" ? (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => run(() => transitionInvoiceAction(slug, inv.id, "issue"))}
                        >
                          {t("issue")}
                        </Button>
                      ) : null}
                      {canWrite && (inv.status === "issued" || inv.status === "overdue") ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => run(() => transitionInvoiceAction(slug, inv.id, "send"))}
                        >
                          {t("send")}
                        </Button>
                      ) : null}
                      {canWrite && OPEN.includes(inv.status) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPaying({ id: inv.id, label: name(inv), balance: inv.balance })
                          }
                        >
                          {t("recordPayment")}
                        </Button>
                      ) : null}
                      <Link
                        href={`/project/${slug}/billing/invoices/${inv.id}`}
                        className={buttonVariants({ size: "sm", variant: "ghost" })}
                      >
                        {t("view")}
                      </Link>
                      {canWrite && inv.status !== "cancelled" && inv.status !== "paid" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            clear();
                            setCancelling(inv);
                          }}
                        >
                          {t("cancel")}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!cancelling ? <BillingError error={error} /> : null}

      {canWrite ? <CustomInvoiceForm slug={slug} currency={currency} /> : null}

      <ConfirmDialog
        open={cancelling !== null}
        title={t("cancelTitle")}
        body={
          <>
            <p className="font-mono text-foreground">
              {cancelling ? `${name(cancelling)} · ${cancelling.title}` : ""}
            </p>
            <p className="mt-2">{t("cancelBody")}</p>
          </>
        }
        confirmLabel={t("cancelConfirm")}
        pending={pending}
        error={errorText}
        onClose={() => setCancelling(null)}
        onConfirm={() => {
          const target = cancelling;
          if (!target) return;
          run(
            () => transitionInvoiceAction(slug, target.id, "cancel"),
            () => setCancelling(null),
          );
        }}
      />
      <PaymentDialog
        slug={slug}
        currency={currency}
        target={paying}
        onClose={() => setPaying(null)}
      />
    </section>
  );
}
