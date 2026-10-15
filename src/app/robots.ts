import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

// Private areas exist under every locale prefix (/en/dashboard, /id/dashboard, ...).
const PRIVATE = ["dashboard", "project", "portal", "invite", "sign-in", "sign-up"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", ...PRIVATE.flatMap((p) => [`/${p}`, `/*/${p}`])],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
