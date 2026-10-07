import { getTranslations } from "next-intl/server";
import { BeforeAfter } from "@/components/landing/before-after";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { Infrastructure } from "@/components/landing/infrastructure";
import { InteractiveDemo } from "@/components/landing/interactive-demo";
import { UseCases } from "@/components/landing/use-cases";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { RevealObserver } from "@/components/primitives/reveal-observer";
import { STATUS_KEYS } from "@/components/primitives/status-badge";
import { ScrollStory } from "@/components/story/scroll-story";
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
        applicationCategory: "DeveloperApplication",
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
  const t = await getTranslations({ locale, namespace: "common.status" });
  const statuses = Object.fromEntries(STATUS_KEYS.map((k) => [k, t(k)]));
  const jsonLd = jsonLdFor(locale, c.meta.description);

  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        <Hero content={c.hero} paths={c.heroPaths} />
        <ScrollStory story={c.story} stage={c.stage} statuses={statuses} />
        <BeforeAfter content={c.beforeAfter} />
        <Infrastructure content={c.infra} planned={c.stage.planned} />
        <InteractiveDemo content={c.demo} />
        <UseCases content={c.useCases} />
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
