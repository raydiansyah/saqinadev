import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE, LOCALES } from "@/i18n/locales";
import { siteConfig } from "@/lib/site";

/** Public, indexable routes. /start is excluded on purpose: it is a noindex tool page. */
const ROUTES = [
  { path: "", priority: 1 },
  { path: "/privacy", priority: 0.3 },
  { path: "/terms", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.flatMap(({ path, priority }) =>
    LOCALES.map((locale) => ({
      url: `${siteConfig.url}/${locale}${path}`,
      changeFrequency: "weekly" as const,
      priority,
      alternates: {
        languages: {
          ...Object.fromEntries(LOCALES.map((l) => [l, `${siteConfig.url}/${l}${path}`])),
          "x-default": `${siteConfig.url}/${DEFAULT_LOCALE}${path}`,
        },
      },
    })),
  );
}
