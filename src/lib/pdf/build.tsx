import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { formatDay } from "@/components/billing/format";
import type { Locale } from "@/i18n/locales";
import { loadMessages } from "@/i18n/messages";
import { getInvoiceItems } from "@/lib/billing/invoices";
import { loadReceipt } from "@/lib/billing/receipts";
import { toInvoiceRow } from "@/lib/billing/summary";
import { db } from "@/lib/db/client";
import { clients, documents, invoices, projects, receipts } from "@/lib/db/schema";
import { getSigningState, toSigningView } from "@/lib/documents/signing";
import { AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { receiptWords } from "@/lib/money-words";
import { loadIssuer, loadLogoFile } from "@/lib/white-label/brand";
import type { PdfIssuer } from "./components";
import { ContractPdf, InvoicePdf, ReceiptPdf } from "./documents";

/**
 * Builds the three kinds of PDF from stored records. These functions do no access check: the
 * caller (a route that checked the person, or the mailer sending to a person the record already
 * belongs to) is responsible for that.
 */

export interface PdfFile {
  bytes: Uint8Array;
  filename: string;
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * A translator for one language outside a page request (a route handler or the mailer), so it
 * reads the message files directly. Keys are plain strings here; the namespaces are checked by
 * the tests that render each file.
 */
async function translators(locale: Locale) {
  const messages = await loadMessages(locale);
  const make = (namespace: string): Translate =>
    createTranslator({ locale, messages, namespace } as never) as unknown as Translate;
  return make;
}

async function pdfIssuer(organizationId: string): Promise<PdfIssuer> {
  const issuer = await loadIssuer(organizationId);
  const logo = issuer.brand ? await loadLogoFile(organizationId) : null;
  return {
    name: issuer.name,
    taxNumber: issuer.taxNumber,
    address: issuer.address,
    brand: issuer.brand ? { name: issuer.brand.name, logo } : null,
  };
}

const day = (value: Date | string | null, locale: Locale) =>
  value === null
    ? "-"
    : formatDay((typeof value === "string" ? value : value.toISOString()).slice(0, 10), locale);

const safeName = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

export async function buildInvoicePdf(invoiceId: string, locale: Locale): Promise<PdfFile> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice) throw new AppError("NOT_FOUND");
  const [[project], items, issuer, m] = await Promise.all([
    db
      .select({ name: projects.name, clientId: projects.clientId })
      .from(projects)
      .where(eq(projects.id, invoice.projectId)),
    getInvoiceItems(invoice.id),
    pdfIssuer(invoice.organizationId),
    translators(locale),
  ]);
  const clientId = invoice.clientId ?? project?.clientId;
  const [client] = clientId
    ? await db
        .select({ name: clients.name, company: clients.company, address: clients.address })
        .from(clients)
        .where(eq(clients.id, clientId))
    : [];
  const t = m("billing.detail");
  const pdf = m("billing.pdf");
  const row = toInvoiceRow(invoice);
  const money = (minor: number) => formatMoney(minor, invoice.currency, locale);
  const number = invoice.number ?? t("draftNumber");
  const bytes = await renderToBuffer(
    <InvoicePdf
      labels={{
        poweredBy: pdf("poweredBy"),
        page: pdf("page"),
        title: t("invoice"),
        from: t("from"),
        billedTo: t("billedTo"),
        project: t("project"),
        issued: t("issued"),
        due: t("due"),
        description: t("description"),
        quantity: t("quantity"),
        unitPrice: t("unitPrice"),
        amount: t("amount"),
        total: t("total"),
        paid: t("paid"),
        balance: t("balance"),
        notes: t("notes"),
        taxNumber: issuer.taxNumber ? t("taxNumber", { value: issuer.taxNumber }) : "",
      }}
      issuer={issuer}
      number={number}
      title={invoice.title}
      project={project?.name ?? ""}
      client={client ?? null}
      issueDate={day(invoice.issueDate, locale)}
      dueDate={day(invoice.dueDate, locale)}
      items={items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit: money(i.unitAmount),
        amount: money(i.amount),
      }))}
      total={money(invoice.total)}
      paid={money(invoice.amountPaid)}
      balance={money(row.balance)}
      notes={invoice.notes}
    />,
  );
  return { bytes: new Uint8Array(bytes), filename: `${safeName(number)}.pdf` };
}

export async function buildReceiptPdf(receiptId: string, locale: Locale): Promise<PdfFile> {
  const [row] = await db
    .select({ projectId: receipts.projectId })
    .from(receipts)
    .where(eq(receipts.id, receiptId));
  if (!row) throw new AppError("NOT_FOUND");
  const [receipt, m] = await Promise.all([
    loadReceipt(row.projectId, receiptId, true),
    translators(locale),
  ]);
  const [{ organizationId }] = await db
    .select({ organizationId: receipts.organizationId })
    .from(receipts)
    .where(eq(receipts.id, receiptId));
  const issuer = await pdfIssuer(organizationId);
  const t = m("billing.receipt");
  const methods = m("billing.methods");
  const pdf = m("billing.pdf");
  const bytes = await renderToBuffer(
    <ReceiptPdf
      labels={{
        poweredBy: pdf("poweredBy"),
        page: pdf("page"),
        title: t("title"),
        receivedFrom: t("receivedFrom"),
        amount: t("amount"),
        inWords: t("inWords"),
        forPayment: t("forPayment"),
        paidOn: t("paidOn"),
        method: t("method"),
        reference: t("reference"),
        issuedOn: t("issuedOn", { date: day(receipt.issuedAt, locale) }),
        issuedBy: t("issuedBy"),
        voided: t("voided"),
      }}
      issuer={issuer}
      number={receipt.number}
      voided={receipt.voided}
      client={receipt.client}
      amount={formatMoney(receipt.amount, receipt.currency, locale)}
      words={receiptWords(receipt.amount, receipt.currency, locale === "id" ? "id" : "en")}
      invoice={`${receipt.invoiceNumber ?? "-"}  ${receipt.invoiceTitle}`}
      project={receipt.projectName}
      paidAt={day(receipt.paidAt, locale)}
      method={methods(receipt.method)}
      reference={receipt.reference}
      issuedAt={day(receipt.issuedAt, locale)}
    />,
  );
  return { bytes: new Uint8Array(bytes), filename: `${safeName(receipt.number)}.pdf` };
}

export async function buildDocumentPdf(documentId: string, locale: Locale): Promise<PdfFile> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) throw new AppError("NOT_FOUND");
  const [[project], signing, m] = await Promise.all([
    db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, doc.projectId)),
    getSigningState(db, doc).then(toSigningView),
    translators(locale),
  ]);
  const issuer = await pdfIssuer(project.organizationId);
  const t = m("billing.pdf");
  const bytes = await renderToBuffer(
    <ContractPdf
      labels={{
        poweredBy: t("poweredBy"),
        page: t("page"),
        signatures: t("contract.signatures"),
        unsigned: t("contract.unsigned"),
        party: { team: t("contract.party.team"), client: t("contract.party.client") },
      }}
      issuer={issuer}
      title={doc.title}
      reference={signing.reference}
      content={doc.content}
      signatures={signing.signatures.map((x) => ({
        party: x.party,
        line: t("contract.signedOn", { name: x.name, date: day(x.signedAt, locale) }),
      }))}
    />,
  );
  return {
    bytes: new Uint8Array(bytes),
    filename: `${safeName(signing.reference ?? doc.slug)}.pdf`,
  };
}
