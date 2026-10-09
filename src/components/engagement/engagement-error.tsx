"use client";

import { useTranslations } from "next-intl";
import { FormError } from "@/components/platform/form-error";
import { Notice } from "@/components/ui/form";

type ErrorLike = { code: string; field?: string } | null;

/**
 * Service rule codes ("cr.notDraft", "engagement.portalOff") and validation codes ("tooShort")
 * map to engagement copy; anything else falls back to the generic form error.
 */
function useKey(error: ErrorLike): string | null {
  const t = useTranslations("engagement.errors");
  const field = error?.field;
  if (!field) return null;
  if (field.includes(".") && t.has(field as never)) return field;
  if (t.has(`fields.${field}` as never)) return `fields.${field}`;
  return null;
}

export function EngagementError({ error }: { error: ErrorLike }) {
  const t = useTranslations("engagement.errors");
  const key = useKey(error);
  if (error && key)
    return (
      <Notice tone="error" className="mt-3">
        {t(key as never)}
      </Notice>
    );
  return <FormError error={error} />;
}

/** Plain text of the same error, for places that take a string (ConfirmDialog). */
export function useEngagementErrorText(error: ErrorLike): string | null {
  const t = useTranslations("engagement.errors");
  const app = useTranslations("app.errors");
  const key = useKey(error);
  if (!error) return null;
  if (key) return t(key as never);
  return app.has(error.code as never) ? app(error.code as never) : app("INTERNAL_ERROR");
}
