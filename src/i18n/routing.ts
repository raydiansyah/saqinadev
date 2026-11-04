import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALES } from "./locales";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // Every page lives under /en or /id so each language has its own crawlable URL.
  localePrefix: "always",
  // The locale is always in the URL, so the NEXT_LOCALE cookie adds nothing. Dropping it keeps
  // public pages free of Set-Cookie, which a shared cache (Cloudflare) would otherwise bypass.
  localeCookie: false,
  // hreflang alternates come from page metadata and the sitemap (with the canonical domain),
  // so the proxy must not add a second, host-dependent set as an HTTP Link header.
  alternateLinks: false,
});
