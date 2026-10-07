import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/** Sends visitors without a locale prefix to /en or /id, based on cookie or Accept-Language. */
export default createMiddleware(routing);

export const config = {
  // Everything except API routes, Next internals, Vercel internals and files with an extension.
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
