"use client";

import { useTranslations } from "next-intl";
import {
  confirmNoteAction,
  withdrawNoteAction,
} from "@/app/[locale]/(portal)/portal/projects/[slug]/meetings/actions";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { EngagementError } from "./error";

/** Confirm a shared team note, or withdraw your own note while it still waits for review. */
export function NoteActions({
  slug,
  id,
  canConfirm,
  canWithdraw,
}: {
  slug: string;
  id: string;
  canConfirm: boolean;
  canWithdraw: boolean;
}) {
  const t = useTranslations("portalEngagement.meetings");
  const { pending, error, run } = useRun();
  if (!canConfirm && !canWithdraw) return null;
  return (
    <div>
      <div className="flex gap-2 pt-1">
        {canConfirm ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => confirmNoteAction(slug, id))}
          >
            {t("confirm")}
          </Button>
        ) : null}
        {canWithdraw ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => withdrawNoteAction(slug, id))}
          >
            {pending ? t("withdrawing") : t("withdraw")}
          </Button>
        ) : null}
      </div>
      <EngagementError error={error} />
    </div>
  );
}
