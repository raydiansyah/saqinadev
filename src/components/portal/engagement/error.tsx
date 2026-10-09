"use client";

import { useTranslations } from "next-intl";
import { Notice } from "@/components/ui/form";

type RunError = { code: string; field?: string } | null;

/** Service field codes ("engagement.noteRequired", "cr.notSent", "tooShort") to copy keys. */
const FIELD_KEYS: Record<string, "noteRequired" | "notSent" | "tooShort" | "tooLong" | "invalid"> =
  {
    "engagement.noteRequired": "noteRequired",
    "cr.notSent": "notSent",
    tooShort: "tooShort",
    tooLong: "tooLong",
    invalid: "invalid",
  };

/** Plain-language text for an action failure; falls back to the generic app errors. */
export function useEngagementErrorText(error: RunError): string | null {
  const t = useTranslations("portalEngagement.errors");
  const app = useTranslations("app.errors");
  if (!error) return null;
  const key = error.field ? FIELD_KEYS[error.field] : undefined;
  if (key) return t(key);
  if (error.code === "RATE_LIMIT") return t("rateLimit");
  return app.has(error.code as never) ? app(error.code as never) : app("INTERNAL_ERROR");
}

export function EngagementError({ error }: { error: RunError }) {
  const text = useEngagementErrorText(error);
  if (!text) return null;
  return (
    <Notice tone="error" className="mt-3">
      {text}
    </Notice>
  );
}
