import { useTranslations } from "next-intl";
import { BrandMark } from "@/components/primitives/brand-mark";
import { Logo } from "@/components/primitives/logo";

export interface IssuerDisplay {
  /** Who issues the document: legal name, brand name or the organization's own name. */
  name: string;
  taxNumber?: string | null;
  address?: string | null;
  /** Present while white label is open: the agency's own mark replaces Saqina's. */
  brand?: { name: string | null; logoUrl: string | null } | null;
}

/**
 * The head of every document: who issues it, with its reference number once it has one. It is
 * drawn around the text, not written into it, so it appears on every document, old or new, and the
 * text that is signed stays exactly the text that was approved. With white label open the agency's
 * logo, legal name, tax number and address lead; otherwise it is the Saqina mark. A small
 * "powered by" line stays either way.
 */
export function Letterhead({
  issuer,
  reference,
}: {
  issuer: IssuerDisplay;
  reference?: string | null;
}) {
  const t = useTranslations("documents.letterhead");
  const branded = Boolean(issuer.brand);
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div className="min-w-0">
        {branded ? (
          <BrandMark brand={issuer.brand ?? null} className="text-lg" />
        ) : (
          <Logo className="text-lg" />
        )}
        {branded ? (
          <p className="mt-2 text-xs text-muted-foreground print:text-black">
            {issuer.name ? (
              <span className="block font-medium text-foreground print:text-black">
                {issuer.name}
              </span>
            ) : null}
            {issuer.taxNumber ? (
              <span className="block">{t("taxNumber", { value: issuer.taxNumber })}</span>
            ) : null}
            {issuer.address ? (
              <span className="block whitespace-pre-line">{issuer.address}</span>
            ) : null}
          </p>
        ) : null}
      </div>
      <p className="text-right text-sm text-muted-foreground print:text-black">
        {!branded && issuer.name ? (
          <span className="block">{t("issuedBy", { name: issuer.name })}</span>
        ) : null}
        {reference ? (
          <span className="block font-mono text-xs text-foreground print:text-black">
            {t("reference", { reference })}
          </span>
        ) : null}
        {branded ? <span className="mt-1 block text-xs">{t("poweredBy")}</span> : null}
      </p>
    </header>
  );
}
