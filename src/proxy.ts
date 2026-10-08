import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { DEFAULT_LOCALE, isLocale } from "./i18n/locales";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

const PROTECTED = /^\/(?:(en|id)\/)?(dashboard|project)(\/|$)/;

/**
 * Locale routing for every page, plus an optimistic sign-in check for the app.
 * The cookie check only saves a round trip; layouts and services validate the session
 * against the database before any project data is read.
 */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const match = PROTECTED.exec(pathname);
  if (match && !getSessionCookie(request)) {
    const locale = match[1] && isLocale(match[1]) ? match[1] : DEFAULT_LOCALE;
    // "Start a project" from the landing page is most likely a new visitor: offer sign-up.
    const entry = /\/dashboard\/new\/?$/.test(pathname) ? "sign-up" : "sign-in";
    const url = new URL(`/${locale}/${entry}`, request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return intl(request);
}

export const config = {
  // Everything except API routes, Next internals, Vercel internals and files with an extension.
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
