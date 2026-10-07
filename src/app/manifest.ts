import type { MetadataRoute } from "next";
import { getSiteContent } from "@/content/site";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { siteConfig } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: "Saqina",
    description: getSiteContent(DEFAULT_LOCALE).meta.description,
    start_url: "/",
    display: "standalone",
    background_color: "#1a1c1f",
    theme_color: "#1a1c1f",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
