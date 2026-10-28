import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { RevealObserver } from "@/components/primitives/reveal-observer";
import { ThemeGallery, ThemesClosing, ThemesHero } from "@/components/themes/gallery";
import { isLocale } from "@/i18n/locales";
import { pageMetadata } from "@/i18n/metadata";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/themes">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "themes" });
  return pageMetadata({
    locale,
    path: "/themes",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function ThemesPage({ params }: PageProps<"/[locale]/themes">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        <ThemesHero locale={locale} />
        <ThemeGallery locale={locale} />
        <ThemesClosing locale={locale} />
      </main>
      <Footer />
      <RevealObserver />
    </>
  );
}
