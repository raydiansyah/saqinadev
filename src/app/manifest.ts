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
    background_color: "#1c1916",
    theme_color: "#1c1916",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
