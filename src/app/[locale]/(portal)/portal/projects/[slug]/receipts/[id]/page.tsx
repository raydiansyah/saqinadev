import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PdfLink } from "@/components/billing/pdf-link";
import { ReceiptDocument } from "@/components/billing/receipt-document";
import { PrintButton } from "@/components/portal/print-button";
import { Link } from "@/i18n/navigation";
import { clientReceipt } from "@/lib/portal/views";
import { orNotFound, portalPageAccess } from "../../../../access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing.receipt");
  return { title: t("metaTitle") };
}

export default async function PortalReceiptPage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/receipts/[id]">) {
  const { slug, id } = await params;
  const [receipt, t] = await Promise.all([
    orNotFound(clientReceipt(await portalPageAccess(slug), id)),
    getTranslations("billing.receipt"),
  ]);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/portal/projects/${slug}/payments`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden="true">←</span> {t("back")}
        </Link>
        <div className="flex flex-wrap gap-2">
          <PdfLink kind="receipt" id={receipt.id} />
          <PrintButton label={t("print")} />
        </div>
      </div>
      <ReceiptDocument receipt={receipt} />
    </div>
  );
}
