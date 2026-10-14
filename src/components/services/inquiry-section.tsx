import { getTranslations } from "next-intl/server";
import { Container } from "@/components/primitives/container";
import { InquiryForm } from "./inquiry-form";

interface InquirySectionProps {
  locale: "en" | "id";
  serviceSlug?: string;
  serviceName?: string;
  preview?: boolean;
  /** Closing block of the catalog: a broader heading instead of the form title. */
  closing?: boolean;
}

/** Anchor target (#inquiry) shared by the catalog and every service page. */
export async function InquirySection({
  locale,
  serviceSlug,
  serviceName,
  preview,
  closing,
}: InquirySectionProps) {
  const t = await getTranslations({ locale, namespace: "services.inquiry" });
  const f = await getTranslations({ locale, namespace: "services.final" });
  return (
    <section
      id="inquiry"
      aria-labelledby="inquiry-heading"
      className="scroll-mt-20 border-t border-border py-20 sm:py-28"
    >
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16">
        <div>
          <p className="mb-4 font-mono text-[0.8125rem] text-primary">services/inquiry.md</p>
          <h2 id="inquiry-heading" className="text-balance text-3xl font-semibold tracking-tight">
            {closing ? f("title") : t("title")}
          </h2>
          <p className="mt-4 text-pretty text-lg text-muted-foreground">
            {closing
              ? f("body")
              : serviceName
                ? t("introService", { service: serviceName })
                : t("intro")}
          </p>
        </div>
        <InquiryForm locale={locale} serviceSlug={serviceSlug} disabled={preview} />
      </Container>
    </section>
  );
}
