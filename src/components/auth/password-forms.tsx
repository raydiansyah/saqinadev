"use client";

import { useLocale, useTranslations } from "next-intl";
import { type SubmitEvent, useId, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { requestPasswordReset, resetPassword } from "@/lib/auth/client";
import { type AuthErrorKey, authErrorKey, isEmail } from "./auth-errors";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const id = useId();
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!isEmail(email)) {
      setFieldError(email ? t("errors.invalidEmail") : t("errors.required"));
      return;
    }
    setFieldError(undefined);
    setPending(true);
    setError(null);
    try {
      const result = await requestPasswordReset({ email, redirectTo: `/${locale}/reset-password` });
      // The same confirmation shows whether or not the account exists (no account enumeration).
      if (result.error && result.error.status === 429) setError("rateLimited");
      else setSentTo(email);
    } catch {
      setError("network");
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <div role="status" className="space-y-4">
        <h2 className="text-lg font-semibold">{t("forgot.sentTitle")}</h2>
        <p className="text-muted-foreground">{t("forgot.sentBody", { email: sentTo })}</p>
        <Link href="/sign-in" className={buttonVariants({ variant: "outline" })}>
          {t("forgot.back")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-busy={pending}>
      <p className="text-muted-foreground">{t("forgot.body")}</p>
      <Field
        id={`${id}-email`}
        name="email"
        type="email"
        autoComplete="email"
        label={t("fields.email")}
        error={fieldError}
        required
      />
      {error ? <Notice tone="error">{t(`errors.${error}`)}</Notice> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("forgot.pending") : t("forgot.submit")}
      </Button>
      <p className="text-center text-sm">
        <Link
          href="/sign-in"
          className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {t("forgot.back")}
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useTranslations("auth");
  const id = useId();
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<{ password?: string; confirm?: string }>({});
  const [state, setState] = useState<"form" | "done" | "invalid">(token ? "form" : "invalid");
  const [error, setError] = useState<AuthErrorKey | null>(null);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    const invalid = {
      password: password.length < 8 ? t("errors.passwordTooShort") : undefined,
      confirm: confirm !== password ? t("errors.passwordMismatch") : undefined,
    };
    setFields(invalid);
    if (invalid.password || invalid.confirm || !token) return;
    setPending(true);
    setError(null);
    try {
      const result = await resetPassword({ newPassword: password, token });
      if (result.error) {
        if (result.error.code === "INVALID_TOKEN") setState("invalid");
        else setError(authErrorKey(result.error));
        return;
      }
      setState("done");
    } catch {
      setError("network");
    } finally {
      setPending(false);
    }
  }

  if (state === "invalid") {
    return (
      <div role="alert" className="space-y-4">
        <h2 className="text-lg font-semibold">{t("reset.invalidTitle")}</h2>
        <p className="text-muted-foreground">{t("reset.invalidBody")}</p>
        <Link href="/forgot-password" className={buttonVariants()}>
          {t("reset.requestNew")}
        </Link>
      </div>
    );
  }
  if (state === "done") {
    return (
      <div role="status" className="space-y-4">
        <h2 className="text-lg font-semibold">{t("reset.doneTitle")}</h2>
        <p className="text-muted-foreground">{t("reset.doneBody")}</p>
        <Link href="/sign-in" className={buttonVariants()}>
          {t("reset.signIn")}
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-busy={pending}>
      <Field
        id={`${id}-password`}
        name="password"
        type="password"
        autoComplete="new-password"
        label={t("fields.newPassword")}
        hint={t("fields.passwordHint")}
        error={fields.password}
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
      {error ? <Notice tone="error">{t(`errors.${error}`)}</Notice> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("reset.pending") : t("reset.submit")}
      </Button>
    </form>
  );
}
