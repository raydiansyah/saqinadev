"use client";

import { useLocale, useTranslations } from "next-intl";
import { type SubmitEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { authClient, signIn } from "@/lib/auth/client";
import { safeNext } from "@/lib/auth/redirect";
import { type AuthErrorKey, authErrorKey, isEmail } from "./auth-errors";
import { Divider, GoogleButton } from "./google-button";

type Status = "idle" | "loading" | "error";

export function SignInForm({
  next,
  googleEnabled,
  notice,
}: {
  next: string | null;
  googleEnabled: boolean;
  notice: "sessionExpired" | "signedOut" | "continueTo" | "oauth" | null;
}) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const id = useId();
  const destination = safeNext(next, locale);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [fields, setFields] = useState<{ email?: string; password?: string }>({});
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState(false);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const invalid = {
      email: !email.trim()
        ? t("errors.required")
        : !isEmail(email)
          ? t("errors.invalidEmail")
          : undefined,
      password: !password ? t("errors.required") : undefined,
    };
    setFields(invalid);
    if (invalid.email || invalid.password) return;

    setStatus("loading");
    setError(null);
    try {
      const result = await signIn.email({
        email: email.trim(),
        password,
        callbackURL: destination,
      });
      if (result.error) {
        setError(authErrorKey(result.error));
        setStatus("error");
        return;
      }
      window.location.assign(destination);
    } catch {
      setError("network");
      setStatus("error");
    }
  }

  async function resendVerification() {
    await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: destination });
    setResent(true);
  }

  const errorUrl = `/${locale}/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <div className="space-y-6">
      {notice ? (
        <Notice tone={notice === "oauth" ? "error" : "info"}>
          {notice === "oauth" ? t("errors.oauth") : t(`notices.${notice}`)}
        </Notice>
      ) : null}

      {googleEnabled ? (
        <>
          <GoogleButton callbackURL={destination} errorURL={errorUrl} />
          <Divider />
        </>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-busy={status === "loading"}>
        <Field
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          label={t("fields.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fields.email}
          required
        />
        <Field
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          label={t("fields.password")}
          error={fields.password}
          required
        />
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("signIn.forgot")}
          </Link>
        </div>

        {error ? (
          <Notice tone="error">
            {t(`errors.${error}`)}
            {error === "emailNotVerified" ? (
              <span className="mt-2 block">
                {resent ? (
                  <span className="text-muted-foreground">{t("verify.resent")}</span>
                ) : (
                  <button
                    type="button"
                    onClick={resendVerification}
                    className="underline underline-offset-4"
                  >
                    {t("verify.resend")}
                  </button>
                )}
              </span>
            ) : null}
          </Notice>
        ) : null}

        <Button type="submit" className="w-full" disabled={status === "loading"}>
          {status === "loading" ? t("signIn.pending") : t("signIn.submit")}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t("signIn.noAccount")}{" "}
        <Link
          href={next ? { pathname: "/sign-up", query: { next } } : "/sign-up"}
          className="text-foreground underline underline-offset-4"
        >
          {t("signIn.createOne")}
        </Link>
      </p>
    </div>
  );
}
