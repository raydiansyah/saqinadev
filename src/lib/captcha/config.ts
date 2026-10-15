/**
 * Cloudflare Turnstile is a production-only control. Locally and in tests it is switched off
 * automatically, so nobody needs keys to develop. The server side needs both keys: a secret
 * without a site key would demand a token that no widget can produce and lock everyone out.
 */

export const CAPTCHA_HEADER = "x-captcha-response";

type Env = Record<string, string | undefined>;

export function isCaptchaEnabled(env: Env = process.env): boolean {
  return (
    env.NODE_ENV === "production" &&
    Boolean(env.TURNSTILE_SECRET_KEY) &&
    Boolean(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  );
}
