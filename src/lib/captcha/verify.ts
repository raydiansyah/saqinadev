import "server-only";
import { log } from "@/lib/log";
import { isCaptchaEnabled } from "./config";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 10_000;

/**
 * Verifies a Turnstile token for server actions. Always true when captcha is disabled
 * (local, test). Fails closed in production: a missing token, a rejected token, a timeout or a
 * network error all return false.
 */
export async function verifyCaptcha(token: string | undefined, ip?: string): Promise<boolean> {
  if (!isCaptchaEnabled()) return true;
  if (!token) return false;
  try {
    const response = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      log.warn("captcha.siteverify_http", { status: response.status });
      return false;
    }
    const result = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!result.success)
      log.warn("captcha.rejected", { codes: (result["error-codes"] ?? []).join(",") });
    return result.success === true;
  } catch (error) {
    log.warn("captcha.siteverify_failed", { error: String(error) });
    return false;
  }
}
