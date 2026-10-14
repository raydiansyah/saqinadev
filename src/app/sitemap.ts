import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE, LOCALES } from "@/i18n/locales";
import { listSitemapServices } from "@/lib/services/queries";
import { siteConfig } from "@/lib/site";

/** Public, indexable routes. /start is excluded on purpose: it is a noindex tool page. */
const ROUTES = [
  { path: "", priority: 1 },
  { path: "/services", priority: 0.8 },
  { path: "/privacy", priority: 0.3 },
  { path: "/terms", priority: 0.3 },
];

const entry = (path: string, priority: number, lastModified?: Date) =>
  LOCALES.map((locale) => ({
    url: `${siteConfig.url}/${locale}${path}`,
    ...(lastModified ? { lastModified } : {}),
    changeFrequency: "weekly" as const,
    priority,
    alternates: {
      languages: {
        ...Object.fromEntries(LOCALES.map((l) => [l, `${siteConfig.url}/${l}${path}`])),
        "x-default": `${siteConfig.url}/${DEFAULT_LOCALE}${path}`,
      },
    },
  }));

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const services = await listSitemapServices();
  return [
    ...ROUTES.flatMap(({ path, priority }) => entry(path, priority)),
    ...services.flatMap((s) => entry(`/services/${s.slug}`, 0.7, s.updatedAt)),
  ];
}
