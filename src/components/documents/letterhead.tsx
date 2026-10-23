import { useTranslations } from "next-intl";
import { Logo } from "@/components/primitives/logo";

/**
 * The head of every document: the default Saqina logo, who issues it, and its reference number
 * once it has one. It is drawn around the text, not written into it, so it appears on every
 * document, old or new, and the text that is signed stays exactly the text that was approved.
 */
export function Letterhead({
  issuer,
  reference,
}: {
  /** The organization that owns the document. */
  issuer: string;
  reference?: string | null;
}) {
  const t = useTranslations("documents.letterhead");
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <Logo className="text-lg" />
      <p className="text-right text-sm text-muted-foreground">
        {issuer ? <span className="block">{t("issuedBy", { name: issuer })}</span> : null}
        {reference ? (
          <span className="block font-mono text-xs text-foreground">
            {t("reference", { reference })}
          </span>
        ) : null}
      </p>
    </header>
  );
}
