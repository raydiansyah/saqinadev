"use client";

import { useTranslations } from "next-intl";
import { FormError } from "@/components/platform/form-error";
import { Notice } from "@/components/ui/form";

/** Billing rule failures ("billing.overpay") get their own copy; anything else falls back. */
export function BillingError({ error }: { error: { code: string; field?: string } | null }) {
  const t = useTranslations("billing.errors");
  const key = error?.field?.startsWith("billing.") ? error.field.slice(8) : null;
  if (error && key && t.has(key as never))
    return (
      <Notice tone="error" className="mt-3">
        {t(key as never)}
      </Notice>
    );
  return <FormError error={error} />;
}

/** Plain text of the same error, for places that take a string (ConfirmDialog). */
export function useBillingErrorText(error: { code: string; field?: string } | null) {
  const t = useTranslations("billing.errors");
  const app = useTranslations("app.errors");
  if (!error) return null;
  const key = error.field?.startsWith("billing.") ? error.field.slice(8) : null;
  if (key && t.has(key as never)) return t(key as never);
  return app.has(error.code as never) ? app(error.code as never) : app("INTERNAL_ERROR");
}
