import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

/**
 * Download link for a file built by /api/pdf. A plain link: the route answers with an attachment,
 * so the browser saves it, and an expired session gets a 401 instead of a page.
 */
export async function PdfLink({
  kind,
  id,
}: {
  kind: "invoice" | "receipt" | "document";
  id: string;
}) {
  const t = await getTranslations("billing.pdf");
  return (
    <a
      href={`/api/pdf/${kind}/${id}`}
      download
      className={buttonVariants({ size: "sm", variant: "outline", className: "print:hidden" })}
    >
      {t("download")}
    </a>
  );
}
