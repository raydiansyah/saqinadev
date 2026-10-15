import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { securityHeaders } from "./src/lib/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // app/[locale]/layout.tsx is the root layout, so unmatched URLs need a global 404 page.
  experimental: { globalNotFound: true },
  // The app is served by Vercel: do not advertise the framework.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV !== "production") }];
  },
};

export default withNextIntl(nextConfig);
