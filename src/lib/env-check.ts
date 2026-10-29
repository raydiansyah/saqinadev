/**
 * Startup configuration check. Misconfiguration in production has been silent so far (emails
 * swallowed, captcha half-on), so this names every problem once in the logs at boot. It only
 * reports; it never throws, because a cold start that crashes is worse than a warning.
 */

type Env = Record<string, string | undefined>;
export interface EnvReport {
  errors: string[];
  warnings: string[];
}

const isBase64Of32Bytes = (value: string) => {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
};

export function checkEnv(env: Env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (env.NODE_ENV !== "production") return { errors, warnings };
  const has = (key: string) => Boolean(env[key]?.trim());

  if (!has("DATABASE_URL")) errors.push("DATABASE_URL is not set");
  if (!has("BETTER_AUTH_SECRET")) errors.push("BETTER_AUTH_SECRET is not set");
  else if ((env.BETTER_AUTH_SECRET ?? "").length < 32)
    errors.push("BETTER_AUTH_SECRET is shorter than 32 characters");
  if (!has("SAQINA_ENCRYPTION_KEY")) errors.push("SAQINA_ENCRYPTION_KEY is not set");
  else if (!isBase64Of32Bytes(env.SAQINA_ENCRYPTION_KEY ?? ""))
    errors.push("SAQINA_ENCRYPTION_KEY must be 32 random bytes, base64 encoded");

  if (!has("BETTER_AUTH_URL")) errors.push("BETTER_AUTH_URL is not set");
  else if (!(env.BETTER_AUTH_URL ?? "").startsWith("https://"))
    errors.push("BETTER_AUTH_URL must be an https URL in production");
  if (!has("NEXT_PUBLIC_SITE_URL"))
    warnings.push("NEXT_PUBLIC_SITE_URL is not set (canonical links)");

  if (!has("CRON_SECRET")) warnings.push("CRON_SECRET is not set: cron jobs will refuse to run");
  if (has("RESEND_API_KEY") !== has("EMAIL_FROM"))
    warnings.push(
      "RESEND_API_KEY and EMAIL_FROM must both be set: email is console-only otherwise",
    );
  if (!has("RESEND_API_KEY") && !has("EMAIL_FROM"))
    warnings.push("Email is not configured: verification and reset emails are not delivered");
  if (has("TURNSTILE_SECRET_KEY") !== has("NEXT_PUBLIC_TURNSTILE_SITE_KEY"))
    warnings.push("Turnstile needs both keys: captcha stays off until both are set");
  if (!has("TURNSTILE_SECRET_KEY") && !has("NEXT_PUBLIC_TURNSTILE_SITE_KEY"))
    warnings.push("Captcha is off: set both Turnstile keys to protect public forms");
  const s3 = ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
  const s3Set = s3.filter(has).length;
  if (s3Set > 0 && s3Set < s3.length)
    warnings.push(`S3 is half configured: set all of ${s3.join(", ")} for chat attachments`);
  else if (s3Set === 0)
    warnings.push("S3 is not configured: chat attachments are refused until it is");
  if (!has("PLATFORM_OWNER_EMAILS") && !has("OWNER_EMAIL"))
    warnings.push("No owner email configured: run `pnpm db:create-owner` once");
  for (const key of ["ALLOW_LOCAL_ENDPOINTS", "ALLOW_LOCAL_GIT"])
    if (has(key)) warnings.push(`${key} is set in production: remove it`);
  return { errors, warnings };
}
