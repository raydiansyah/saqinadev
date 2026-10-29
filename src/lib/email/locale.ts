import { isLocale, type Locale } from "@/i18n/locales";

/**
 * Which language the person is using, read from where they are on the site. Visitors browsing
 * /id/... get Indonesian mail, /en/... English. Sources are tried in order of reliability.
 */

/** "/id/sign-up?x=1" or "https://saqina.dev/id/sign-up" to "id". */
export function localeFromPath(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined;
  let path = value;
  if (/^https?:\/\//i.test(value)) {
    try {
      path = new URL(value).pathname;
    } catch {
      return undefined;
    }
  }
  const match = /^\/([a-z]{2})(?:[/?#]|$)/.exec(path);
  return match && isLocale(match[1]) ? match[1] : undefined;
}

interface Sources {
  /** The action link Better Auth built; its callbackURL query carries the page the visitor chose. */
  url?: string;
  callbackURL?: unknown;
  redirectTo?: unknown;
  referer?: string | null;
}

export function detectLocale(sources: Sources): Locale | undefined {
  let fromUrl: string | null = null;
  if (sources.url) {
    try {
      // Without a configured base URL the action link is relative ("/api/auth/verify-email?...").
      fromUrl = new URL(sources.url, "http://localhost").searchParams.get("callbackURL");
    } catch {
      fromUrl = null;
    }
  }
  const text = (v: unknown) => (typeof v === "string" ? v : undefined);
  return (
    localeFromPath(fromUrl) ??
    localeFromPath(text(sources.callbackURL)) ??
    localeFromPath(text(sources.redirectTo)) ??
    localeFromPath(sources.referer)
  );
}
