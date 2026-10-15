import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { ServiceDetail } from "@/components/services/service-detail";
import { serviceJsonLd } from "@/components/services/service-json-ld";
import { isLocale } from "@/i18n/locales";
import { pageMetadata } from "@/i18n/metadata";
import { getPublicService, resolveServiceRedirect } from "@/lib/services/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/services/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const found = await getPublicService(slug, locale);
  if (!found) return { robots: { index: false, follow: false } };
  const { service } = found;
  return pageMetadata({
    locale,
    path: `/services/${service.slug}`,
    title: service.metaTitle,
    description: service.metaDescription,
    image: service.imageUrl,
  });
}

export default async function ServicePage({ params }: PageProps<"/[locale]/services/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const found = await getPublicService(slug, locale);
  if (!found) {
    // An old slug keeps working: send it to where the service lives now.
    const next = await resolveServiceRedirect(slug);
    if (next) permanentRedirect(`/${locale}/services/${next}`);
    notFound();
  }
  const t = await getTranslations({ locale, namespace: "services.detail" });
  const jsonLd = serviceJsonLd(found.service, locale, t("home"), t("all"));

  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        <ServiceDetail service={found.service} related={found.related} locale={locale} />
      </main>
      <Footer />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD with "<" escaped
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
