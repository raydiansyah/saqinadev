import { getLocale, getTranslations } from "next-intl/server";
import { formatDay } from "@/components/billing/format";
import { Letterhead } from "@/components/documents/letterhead";
import type { ReceiptView } from "@/lib/billing/receipts";
import { formatMoney } from "@/lib/money";
import { receiptWords } from "@/lib/money-words";

/**
 * The receipt (kwitansi) as a printable page, shared by the team view and the client portal.
 * Everything shown comes from the stored receipt; nothing is recomputed from the invoice.
 */
export async function ReceiptDocument({ receipt }: { receipt: ReceiptView }) {
  const [t, methods, locale] = await Promise.all([
    getTranslations("billing.receipt"),
    getTranslations("billing.methods"),
    getLocale(),
  ]);
  const words = receiptWords(receipt.amount, receipt.currency, locale === "id" ? "id" : "en");
  const label = "text-xs text-muted-foreground print:text-black";
  return (
    <article className="rounded-lg border border-border p-6 sm:p-8 print:border-0 print:p-0 print:text-black">
      <Letterhead issuer={receipt.issuer} reference={receipt.number} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        {receipt.voided ? (
          <p className="rounded-sm border border-error/50 px-2 py-0.5 font-mono text-xs text-error">
            {t("voided")}
          </p>
        ) : null}
      </div>

      <dl className="mt-6 space-y-5 text-sm">
        <div>
          <dt className={label}>{t("receivedFrom")}</dt>
          <dd className="mt-1">
            {receipt.client ? (
              <>
                <span className="block font-medium">{receipt.client.name}</span>
                {receipt.client.company && receipt.client.company !== receipt.client.name ? (
                  <span className="block">{receipt.client.company}</span>
                ) : null}
                {receipt.client.address ? (
                  <span className="block whitespace-pre-line text-muted-foreground print:text-black">
                    {receipt.client.address}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </dd>
        </div>
        <div>
          <dt className={label}>{t("amount")}</dt>
          <dd className="mt-1 font-mono text-2xl font-semibold">
            {formatMoney(receipt.amount, receipt.currency, locale)}
          </dd>
          <dd className="mt-1 text-muted-foreground print:text-black">
            <span className="font-medium">{t("inWords")}:</span> {words}
          </dd>
        </div>
        <div>
          <dt className={label}>{t("forPayment")}</dt>
          <dd className="mt-1">
            <span className="font-mono">{receipt.invoiceNumber ?? "-"}</span>
            <span className="ml-2">{receipt.invoiceTitle}</span>
            <span className="block text-muted-foreground print:text-black">
              {receipt.projectName}
            </span>
          </dd>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <dt className={label}>{t("paidOn")}</dt>
            <dd className="mt-1">{formatDay(receipt.paidAt, locale)}</dd>
          </div>
          <div>
            <dt className={label}>{t("method")}</dt>
            <dd className="mt-1">{methods(receipt.method)}</dd>
          </div>
          <div className="min-w-0">
            <dt className={label}>{t("reference")}</dt>
            <dd className="mt-1 font-mono break-all">{receipt.reference || "-"}</dd>
          </div>
        </div>
      </dl>

      <footer className="mt-8 flex flex-wrap items-end justify-between gap-6 border-t border-border pt-4 text-sm">
        <p className="text-muted-foreground print:text-black">
          {t("issuedOn", { date: formatDay(receipt.issuedAt.toISOString().slice(0, 10), locale) })}
        </p>
        <p className="text-right">
          <span className="block text-xs text-muted-foreground print:text-black">
            {t("issuedBy")}
          </span>
          <span className="mt-8 block font-medium">{receipt.issuer.name}</span>
        </p>
      </footer>
    </article>
  );
}
