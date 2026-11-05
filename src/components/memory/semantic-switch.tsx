"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { setSemanticSearchAction } from "@/app/[locale]/(app)/project/[slug]/memory/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { SEMANTIC_CONSENT_VERSION } from "@/lib/domain/memory";

/** Turns semantic search on (with a consent dialog) or off. Only admins see it. */
export function SemanticSwitch({
  slug,
  enabled,
  modelConfigured,
  provider,
}: {
  slug: string;
  enabled: boolean;
  modelConfigured: boolean;
  provider: string | null;
}) {
  const t = useTranslations("memoryHub.semanticSearch");
  const [open, setOpen] = useState(false);
  const platformErrors = useTranslations("platform.errors");
  const appErrors = useTranslations("app.errors");
  const { pending, error, run, clear } = useRun();

  if (!enabled && !modelConfigured) return null;

  // The action reports `consent: "required"` or `semantic: "noModel"`; useRun keeps the value.
  const known =
    error?.field === "noModel" ? "noModel" : error?.field === "required" ? "consent" : null;

  // Same fallback chain as FormError, so the text inside the dialog matches the page notice.
  const field = error?.field?.split(":")[0];
  const dialogError = !error
    ? null
    : known
      ? t(`errors.${known}`)
      : field && platformErrors.has(field as never)
        ? platformErrors(field as never)
        : appErrors.has(error.code as never)
          ? appErrors(error.code as never)
          : appErrors("INTERNAL_ERROR");

  return (
    <div className="mb-4">
      <Button
        variant={enabled ? "outline" : "primary"}
        disabled={pending}
        onClick={() => {
          clear();
          setOpen(true);
        }}
      >
        {enabled ? t("disable") : t("enable")}
      </Button>
      {/* While the dialog is open the error shows inside it, not behind the overlay. */}
      {open ? null : known ? (
        <Notice tone="error" className="mt-3">
          {t(`errors.${known}`)}
        </Notice>
      ) : (
        <FormError error={error} />
      )}
      <ConfirmDialog
        open={open}
        title={enabled ? t("disableTitle") : t("consentTitle")}
        body={
          <p>
            {enabled
              ? t("disableBody")
              : provider
                ? t("consentBodyNamed", { provider })
                : t("consentBody")}
          </p>
        }
        confirmLabel={enabled ? t("disable") : t("consentConfirm")}
        confirmVariant={enabled ? "danger" : "primary"}
        pending={pending}
        error={dialogError}
        onConfirm={() =>
          run(
            // The version of the consent text this dialog shows; the server rejects an older one.
            () =>
              setSemanticSearchAction(
                slug,
                !enabled,
                enabled ? undefined : SEMANTIC_CONSENT_VERSION,
              ),
            () => setOpen(false),
          )
        }
        onClose={() => {
          clear();
          setOpen(false);
        }}
      />
    </div>
  );
}
