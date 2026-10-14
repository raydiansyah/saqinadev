import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { RevealObserver } from "@/components/primitives/reveal-observer";
import {
  CustomSolutions,
  HowSaqinaHelps,
  ServicesCatalog,
  ServicesHero,
} from "@/components/services/catalog-sections";
import { InquirySection } from "@/components/services/inquiry-section";
import { isLocale } from "@/i18n/locales";
import { pageMetadata } from "@/i18n/metadata";
import { listPublicServices } from "@/lib/services/queries";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/services">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "services" });
  return pageMetadata({
    locale,
    path: "/services",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

// The catalog is read per request so published changes show up immediately.
export const dynamic = "force-dynamic";

export default async function ServicesPage({ params }: PageProps<"/[locale]/services">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const services = await listPublicServices(locale);

  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        <ServicesHero locale={locale} />
        <ServicesCatalog services={services} locale={locale} />
        <HowSaqinaHelps locale={locale} />
        <CustomSolutions locale={locale} />
        <InquirySection locale={locale} closing />
      </main>
      <Footer />
      <RevealObserver />
    </>
  );
}
