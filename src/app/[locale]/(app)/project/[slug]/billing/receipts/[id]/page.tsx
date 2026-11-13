import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PdfLink } from "@/components/billing/pdf-link";
import { PrintButton } from "@/components/billing/print-button";
import { ReceiptDocument } from "@/components/billing/receipt-document";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { loadReceipt } from "@/lib/billing/receipts";
import { isAppError } from "@/lib/errors";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing.receipt");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Printable receipt. Only members with billing access reach it; others get the 404 page. */
export default async function ReceiptPage({
  params,
}: PageProps<"/[locale]/project/[slug]/billing/receipts/[id]">) {
  const { slug, id } = await params;
  const { project } = await projectPageAccess(slug, "billing:read");
  const t = await getTranslations("billing.receipt");
  const receipt = await loadReceipt(project.id, id, true).catch((error: unknown) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/project/${slug}/billing`}
          className={buttonVariants({ size: "sm", variant: "ghost" })}
        >
          {t("back")}
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
