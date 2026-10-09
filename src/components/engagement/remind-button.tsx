"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { remindClientAction } from "@/app/[locale]/(app)/project/[slug]/changes/actions";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { useEngagementErrorText } from "./engagement-error";

/** Sends the client a reminder now. At most one per item per day (enforced by the service). */
export function RemindButton({
  slug,
  entityType,
  entityId,
}: {
  slug: string;
  entityType: "change_request" | "client_approval" | "invoice";
  entityId: string;
}) {
  const t = useTranslations("engagement.common");
  const { pending, error, run } = useRun();
  const [sent, setSent] = useState(false);
  const errorText = useEngagementErrorText(error);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending || sent}
        onClick={() =>
          run(
            () => remindClientAction(slug, { entityType, entityId }),
            () => setSent(true),
          )
        }
      >
        {sent ? t("reminded") : t("remind")}
      </Button>
      <span aria-live="polite" className="max-w-56 text-right text-xs text-error">
        {errorText}
      </span>
    </span>
  );
}
