"use client";

import { useLocale, useTranslations } from "next-intl";
import { type SubmitEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { signUp } from "@/lib/auth/client";
import { safeNext } from "@/lib/auth/redirect";
import { type AuthErrorKey, authErrorKey, isEmail } from "./auth-errors";
import { Divider, GoogleButton } from "./google-button";

type FieldErrors = Partial<Record<"name" | "email" | "password" | "confirm", string>>;

export function SignUpForm({
  next,
  googleEnabled,
}: {
  next: string | null;
  googleEnabled: boolean;
}) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const id = useId();
  const destination = safeNext(next ?? `/${locale}/dashboard?welcome=1`, locale);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    const invalid: FieldErrors = {
      name: name.length < 2 ? t("errors.nameTooShort") : undefined,
      email: !email ? t("errors.required") : !isEmail(email) ? t("errors.invalidEmail") : undefined,
      password: password.length < 8 ? t("errors.passwordTooShort") : undefined,
      confirm: confirm !== password ? t("errors.passwordMismatch") : undefined,
    };
    setFields(invalid);
    if (Object.values(invalid).some(Boolean)) return;

    setPending(true);
    setError(null);
    try {
      const result = await signUp.email({ name, email, password, callbackURL: destination });
      if (result.error) {
        setError(authErrorKey(result.error));
        return;
      }
      setSentTo(email);
    } catch {
      setError("network");
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <div role="status" className="space-y-3">
        <h2 className="text-lg font-semibold">{t("signUp.checkEmailTitle")}</h2>
        <p className="text-muted-foreground">{t("signUp.checkEmailBody", { email: sentTo })}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {googleEnabled ? (
        <>
          <GoogleButton callbackURL={destination} errorURL={`/${locale}/sign-in?error=oauth`} />
          <Divider />
        </>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-busy={pending}>
        <Field
          id={`${id}-name`}
          name="name"
          autoComplete="name"
          label={t("fields.name")}
          error={fields.name}
          maxLength={80}
          required
        />
        <Field
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          label={t("fields.email")}
          error={fields.email}
          required
        />
        <Field
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="new-password"
          label={t("fields.password")}
          hint={t("fields.passwordHint")}
          error={fields.password}
          minLength={8}
          maxLength={128}
          required
        />
        <Field
          id={`${id}-confirm`}
          name="confirm"
          type="password"
          autoComplete="new-password"
          label={t("fields.confirmPassword")}
          error={fields.confirm}
          required
        />

        {error ? (
          <Notice tone="error">
            {t(`errors.${error}`)}
            {error === "userExists" ? (
              <Link href="/sign-in" className="ml-1 underline underline-offset-4">
                {t("signUp.signIn")}
              </Link>
            ) : null}
          </Notice>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t("signUp.pending") : t("signUp.submit")}
        </Button>
        <p className="text-xs text-subtle-foreground">
          {t.rich("signUp.terms", {
            terms: (chunks) => (
              <Link href="/terms" className="underline underline-offset-4">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href="/privacy" className="underline underline-offset-4">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t("signUp.haveAccount")}{" "}
        <Link
          href={next ? { pathname: "/sign-in", query: { next } } : "/sign-in"}
          className="text-foreground underline underline-offset-4"
        >
          {t("signUp.signIn")}
        </Link>
      </p>
    </div>
  );
}
