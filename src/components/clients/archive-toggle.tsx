"use client";

import { useTranslations } from "next-intl";
import { updateClientAction } from "@/app/[locale]/(app)/dashboard/clients/actions";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import type { ClientStatus } from "@/lib/domain/business";
import type { ClientValues } from "./client-form";

/** Archive or restore; the update endpoint takes the full record, so current values go along. */
export function ArchiveToggle({
  clientId,
  status,
  values,
}: {
  clientId: string;
  status: ClientStatus;
  values: ClientValues;
}) {
  const t = useTranslations("clients.detail");
  const { pending, error, run } = useRun();
  const next: ClientStatus = status === "active" ? "archived" : "active";
  return (
    <div>
      <Button
        size="sm"
        variant={status === "active" ? "danger" : "outline"}
        disabled={pending}
        onClick={() => run(() => updateClientAction(clientId, { ...values, status: next }))}
      >
        {status === "active" ? t("archive") : t("unarchive")}
      </Button>
      <FormError error={error} />
    </div>
  );
}
