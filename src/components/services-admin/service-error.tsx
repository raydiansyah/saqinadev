"use client";

import { useTranslations } from "next-intl";
import { Notice } from "@/components/ui/form";

type ErrorLike = { code: string; field?: string } | null;

const CODE_KEYS = {
  "services.slugTaken": "slugTaken",
  "services.titleRequired": "titleRequired",
  "services.useConvert": "useConvert",
  "services.alreadyConverted": "alreadyConverted",
  tooShort: "tooShort",
  tooLong: "tooLong",
  invalid: "invalid",
} as const;

/** Field paths whose "invalid" code has a more specific explanation. */
const PATH_KEYS: Record<
  string,
  "priceAmount" | "imageUrl" | "slug" | "titleRequired" | "displayOrder" | "relatedIds"
> = {
  priceAmount: "priceAmount",
  imageUrl: "imageUrl",
  slug: "slug",
  title: "titleRequired",
  displayOrder: "displayOrder",
  relatedIds: "relatedIds",
};

/** Translated text for one error code, optionally refined by the field path it belongs to. */
export function useErrorMessage() {
  const t = useTranslations("servicesAdmin.errors");
  return (code: string, path?: string): string => {
    if (code === "invalid" && path && PATH_KEYS[path.split(".")[0]]) {
      return t(PATH_KEYS[path.split(".")[0]]);
    }
    const key = CODE_KEYS[code as keyof typeof CODE_KEYS];
    return key ? t(key) : t("invalid");
  };
}

/** Inline notice for errors coming from `useRun` (field holds the first error code). */
export function ServiceError({ error }: { error: ErrorLike }) {
  const text = useServiceErrorText(error);
  if (!error || !text) return null;
  return (
    <Notice tone="error" className="mt-3">
      {text}
    </Notice>
  );
}

/** Plain text of the same error, for places that take a string (ConfirmDialog). */
export function useServiceErrorText(error: ErrorLike): string | null {
  const message = useErrorMessage();
  const app = useTranslations("app.errors");
  if (!error) return null;
  if (error.field && error.field in CODE_KEYS) return message(error.field);
  return app.has(error.code as never) ? app(error.code as never) : app("INTERNAL_ERROR");
}
