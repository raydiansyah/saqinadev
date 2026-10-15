"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { submitInquiryAction } from "@/app/[locale]/(marketing)/services/actions";
import { useCaptcha } from "@/components/captcha/use-captcha";
import { Button } from "@/components/ui/button";
import { Field, Notice, TextArea } from "@/components/ui/form";
import type { FieldErrors } from "@/lib/errors";

interface InquiryFormProps {
  locale: "en" | "id";
  /** Slug of the service this inquiry is about. Omitted on the catalog page. */
  serviceSlug?: string;
  /** Preview of an unpublished service: nothing can be submitted. */
  disabled?: boolean;
}

type Status =
  | { kind: "idle" }
  | { kind: "success" }
  | { kind: "error"; code: string; ref?: string };

const FIELDS = ["name", "company", "email", "whatsapp", "message", "consent"] as const;

export function InquiryForm({ locale, serviceSlug, disabled }: InquiryFormProps) {
  const t = useTranslations("services.inquiry");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [fields, setFields] = useState<FieldErrors>({});
  const captcha = useCaptcha();

  const fieldError = (name: (typeof FIELDS)[number]) => {
    if (!fields[name]) return undefined;
    return t.has(`errors.fields.${name}`) ? t(`errors.fields.${name}`) : t("errors.fieldInvalid");
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (key: string) => String(data.get(key) ?? "");
    if (captcha.enabled && !captcha.token) {
      setFields({});
      setStatus({ kind: "error", code: "CAPTCHA" });
      return;
    }
    startTransition(async () => {
      const result = await submitInquiryAction({
        serviceSlug,
        name: text("name"),
        company: text("company"),
        email: text("email"),
        whatsapp: text("whatsapp"),
        message: text("message"),
        consent: data.get("consent") === "on",
        website: text("website"),
        captchaToken: captcha.token ?? undefined,
        locale,
      });
      captcha.reset();
      if (result.ok) {
        setFields({});
        setStatus({ kind: "success" });
        form.reset();
        return;
      }
      setFields(result.fields ?? {});
      // The service reports a failed check as a validation error on the "captcha" field.
      setStatus({
        kind: "error",
        code: result.fields?.captcha ? "CAPTCHA" : result.code,
        ref: result.ref,
      });
    });
  }

  if (status.kind === "success") {
    return (
      <div role="status" aria-live="polite" className="rounded-lg border border-success/40 p-6">
        <p className="text-lg font-semibold text-success">{t("success.title")}</p>
        <p className="mt-2 text-muted-foreground">{t("success.body")}</p>
        <Button
          variant="outline"
          className="mt-5"
          onClick={() => setStatus({ kind: "idle" })}
          type="button"
        >
          {t("success.again")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5" aria-busy={pending}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="inquiry-name"
          name="name"
          label={t("name")}
          placeholder={t("placeholders.name")}
          autoComplete="name"
          required
          maxLength={120}
          error={fieldError("name")}
        />
        <Field
          id="inquiry-company"
          name="company"
          label={t("company")}
          placeholder={t("placeholders.company")}
          hint={t("companyHint")}
          autoComplete="organization"
          maxLength={160}
          error={fieldError("company")}
        />
        <Field
          id="inquiry-email"
          name="email"
          type="email"
          label={t("email")}
          placeholder={t("placeholders.email")}
          autoComplete="email"
          inputMode="email"
          required
          maxLength={200}
          error={fieldError("email")}
        />
        <Field
          id="inquiry-whatsapp"
          name="whatsapp"
          type="tel"
          label={t("whatsapp")}
          placeholder={t("placeholders.whatsapp")}
          hint={t("whatsappHint")}
          autoComplete="tel"
          maxLength={40}
          error={fieldError("whatsapp")}
        />
      </div>
      <TextArea
        id="inquiry-message"
        name="message"
        label={t("message")}
        placeholder={t("placeholders.message")}
        hint={t("messageHint")}
        rows={5}
        required
        maxLength={3000}
        error={fieldError("message")}
      />
      {/* Honeypot: hidden from people and assistive tech; bots that fill it are dropped. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="consent"
            required
            aria-invalid={fields.consent ? true : undefined}
            aria-describedby={fields.consent ? "inquiry-consent-error" : undefined}
            className="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <span>{t("consent")}</span>
        </label>
        {fields.consent ? (
          <p id="inquiry-consent-error" className="mt-1.5 text-sm text-error">
            {fieldError("consent")}
          </p>
        ) : null}
      </div>
      {captcha.widget}
      <div aria-live="polite">
        {status.kind === "error" ? (
          <Notice tone="error">
            <p>
              {status.code === "CAPTCHA"
                ? t("errors.captcha")
                : status.code === "VALIDATION_ERROR"
                  ? t("errors.validation")
                  : status.code === "RATE_LIMIT"
                    ? t("errors.rateLimit")
                    : status.code === "NOT_FOUND"
                      ? t("errors.notFound")
                      : t("errors.generic")}
            </p>
            {status.ref ? (
              <p className="mt-1 font-mono text-xs">{t("errors.reference", { ref: status.ref })}</p>
            ) : null}
          </Notice>
        ) : null}
      </div>
      <div>
        <Button type="submit" size="lg" disabled={pending || disabled} className="w-full sm:w-auto">
          {pending ? t("sending") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
