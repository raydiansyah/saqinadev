"use client";

import { useTranslations } from "next-intl";
import { setDocumentSharedAction } from "@/app/[locale]/(app)/project/[slug]/documents/actions";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";

/** Shares an approved document with the client portal. Drafts cannot be shared. */
export function ShareToggle({
  slug,
  docSlug,
  approved,
  shared,
}: {
  slug: string;
  docSlug: string;
  approved: boolean;
  shared: boolean;
}) {
  const t = useTranslations("billing.share");
  const { pending, error, run } = useRun();
  return (
    <div>
      <label
        className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground"
        title={approved ? undefined : t("hint")}
      >
        <input
          type="checkbox"
          checked={shared}
          disabled={!approved || pending}
          onChange={(e) => {
            const visible = e.target.checked;
            run(() => setDocumentSharedAction(slug, docSlug, visible));
          }}
          className="size-4 accent-primary"
        />
        {t("label")}
      </label>
      {!approved ? <span className="sr-only">{t("hint")}</span> : null}
      <FormError error={error} />
    </div>
  );
}
