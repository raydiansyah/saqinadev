"use client";

import { useTranslations } from "next-intl";
import { Notice } from "@/components/ui/form";

/** Field-level codes first (translated), then the generic app error. */
export function FormError({
  error,
}: {
  error: { code: string; field?: string; ref?: string } | null;
}) {
  const t = useTranslations("platform.errors");
  const app = useTranslations("app.errors");
  if (!error) return null;
  const field = error.field?.split(":")[0];
  const text =
    field && t.has(field as never)
      ? t(field as never)
      : app.has(error.code as never)
        ? app(error.code as never)
        : app("INTERNAL_ERROR");
  return (
    <Notice tone="error" className="mt-3">
      {text}
      {error.field?.startsWith("capability:") ? ` (${error.field.slice(11)})` : ""}
      {/* An error on our side carries a code the team can look up in the logs. */}
      {error.ref && error.code === "INTERNAL_ERROR" ? (
        <span className="mt-1 block font-mono text-xs">{app("reference", { ref: error.ref })}</span>
      ) : null}
    </Notice>
  );
}
