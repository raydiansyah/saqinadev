import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { InteractiveDemo } from "@/components/landing/interactive-demo";
import { Lifecycle } from "@/components/landing/lifecycle";
import { Pillars } from "@/components/landing/pillars";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { RevealObserver } from "@/components/primitives/reveal-observer";
import { getSiteContent } from "@/content/site";
import type { Locale } from "@/i18n/locales";
import { siteConfig } from "@/lib/site";

function jsonLdFor(locale: Locale, description: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteConfig.url}/#organization`,
        name: siteConfig.name,
        url: siteConfig.url,
      },
      {
        "@type": "SoftwareApplication",
        name: siteConfig.name,
        url: siteConfig.url,
        description,
        applicationCategory: "BusinessApplication",
        inLanguage: locale,
        operatingSystem: "Web",
        publisher: { "@id": `${siteConfig.url}/#organization` },
      },
    ],
  };
}

export default async function LandingPage({ params }: PageProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const c = getSiteContent(locale);
  const jsonLd = jsonLdFor(locale, c.meta.description);

  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        <Hero content={c.hero} />
        <Lifecycle content={c.lifecycle} />
        <Pillars content={c.pillars} />
        <InteractiveDemo content={c.demo} />
        <FinalCta content={c.finalCta} />
      </main>
      <Footer />
      <RevealObserver />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD with "<" escaped
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
