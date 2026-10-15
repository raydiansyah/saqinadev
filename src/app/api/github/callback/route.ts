import { NextResponse } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { getActor } from "@/lib/auth/server";
import { githubCallbackUrl, isGithubConnectEnabled } from "@/lib/github/config";
import { completeConnect } from "@/lib/github/connection";
import { STATE_COOKIE, unpackCookie } from "@/lib/github/oauth";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GitHub sends the visitor back here with a one-time code. The token never leaves the server. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookie = unpackCookie(
    request.headers
      .get("cookie")
      ?.split(/;\s*/)
      .find((c) => c.startsWith(`${STATE_COOKIE}=`))
      ?.slice(STATE_COOKIE.length + 1),
  );
  const locale = cookie && isLocale(cookie.locale) ? cookie.locale : DEFAULT_LOCALE;
  const back = (flag: string) => {
    const response = NextResponse.redirect(
      new URL(`/${locale}/dashboard/new?github=${flag}`, request.url),
    );
    // The state is single use, whatever happened.
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/github" });
    return response;
  };

  const actor = await getActor();
  const redirectUri = githubCallbackUrl();
  if (!actor) {
    return NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url));
  }
  if (!isGithubConnectEnabled() || !redirectUri) return back("not_configured");

  try {
    const result = await completeConnect(actor, {
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      error: url.searchParams.get("error"),
      cookieState: cookie?.state ?? null,
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET as string,
      redirectUri,
    });
    return back(result.ok ? "connected" : result.error);
  } catch (error) {
    log.error("github.connect_failed", { error: String(error) });
    return back("exchange_failed");
  }
}
