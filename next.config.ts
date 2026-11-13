import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { securityHeaders } from "./src/lib/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // app/[locale]/layout.tsx is the root layout, so unmatched URLs need a global 404 page.
  experimental: { globalNotFound: true },
  // The Docker image (docs/runbook.md, VPS) runs the standalone server; Vercel builds without it.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Do not advertise the framework.
  poweredByHeader: false,
  // The guide screenshots are read from disk at request time, so they must ship with the route.
  outputFileTracingIncludes: {
    "/api/docs/assets/[audience]/[name]": ["./src/content/docs/assets/**/*"],
  },
  async headers() {
    // Public, session-independent pages: let Cloudflare and Vercel's CDN hold them.
    // s-maxage governs the shared cache; stale-while-revalidate serves a stale copy for a day
    // while a fresh one is fetched in the background. Browsers get no private max-age on purpose.
    const publicCache = [
      { key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" },
    ];
    // Locale-prefixed public pages. The matcher is explicit so no private path can ever match:
    // dashboard, project, portal, auth, invite and /api are absent by construction.
    const publicSources = ["/:locale(en|id)", "/:locale(en|id)/privacy", "/:locale(en|id)/terms"];
    return [
      { source: "/:path*", headers: securityHeaders(process.env.NODE_ENV !== "production") },
      ...publicSources.map((source) => ({ source, headers: publicCache })),
    ];
  },
};

export default withNextIntl(nextConfig);
