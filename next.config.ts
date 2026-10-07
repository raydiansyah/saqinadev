import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // app/[locale]/layout.tsx is the root layout, so unmatched URLs need a global 404 page.
  experimental: { globalNotFound: true },
};

export default withNextIntl(nextConfig);
