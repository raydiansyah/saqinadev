import { NextResponse } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { getActor } from "@/lib/auth/server";
import { appOrigin, githubCallbackUrl, isGithubConnectEnabled } from "@/lib/github/config";
import {
  authorizeUrl,
  newState,
  packCookie,
  STATE_COOKIE,
  STATE_MAX_AGE,
} from "@/lib/github/oauth";
import { allow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts "Connect with GitHub": remembers a one-time state and sends the visitor to GitHub. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("locale") ?? "";
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  const back = (flag: string) =>
    NextResponse.redirect(new URL(`/${locale}/dashboard/new?github=${flag}`, request.url));

  const actor = await getActor();
  if (!actor) {
    return NextResponse.redirect(
      new URL(
        `/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/dashboard/new`)}`,
        request.url,
      ),
    );
  }
  const redirectUri = githubCallbackUrl();
  const origin = appOrigin();
  if (!isGithubConnectEnabled() || !redirectUri || !origin) return back("not_configured");
  // The state cookie must come back to the same host that set it, so start on the canonical one.
  if (url.origin !== origin) {
    return NextResponse.redirect(new URL(`/api/github/connect?locale=${locale}`, origin));
  }
  if (!(await allow(`github-connect:${actor.id}`, 10, 60 * 60 * 1000))) return back("rate_limited");

  const state = newState();
  const response = NextResponse.redirect(
    authorizeUrl({
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID as string,
      redirectUri,
      state,
    }),
  );
  response.cookies.set(STATE_COOKIE, packCookie(state, locale), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/github",
    maxAge: STATE_MAX_AGE,
  });
  return response;
}
