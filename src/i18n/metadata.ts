import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales";

const OG_LOCALE: Record<Locale, string> = { en: "en_US", id: "id_ID" };

/** Canonical URL plus hreflang alternates (and x-default) for a path such as "/" or "/privacy". */
export function alternatesFor(locale: Locale, path: string): Metadata["alternates"] {
  const suffix = path === "/" ? "" : path;
  return {
    canonical: `/${locale}${suffix}`,
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l, `/${l}${suffix}`])),
      "x-default": `/${DEFAULT_LOCALE}${suffix}`,
    },
  };
}

interface PageMeta {
  locale: Locale;
  path: string;
  title: string;
  description: string;
  /** Use the title as-is instead of the "%s · Saqina Dev" template. */
  absoluteTitle?: boolean;
  index?: boolean;
}

/** Shared metadata shape for every localised page. */
export function pageMetadata({
  locale,
  path,
  title,
  description,
  absoluteTitle,
  index = true,
}: PageMeta): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: alternatesFor(locale, path),
    openGraph: {
      type: "website",
      url: `/${locale}${path === "/" ? "" : path}`,
      siteName: siteConfig.name,
      title,
      description,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index, follow: true },
  };
}
