"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { decideChangeRequestAction } from "@/app/[locale]/(portal)/portal/projects/[slug]/changes/actions";
import { Dialog } from "@/components/app/dialog";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/form";
import { useEngagementErrorText } from "./error";

/**
 * Approve or decline a sent change request. Both go through a dialog: approving states
 * that the cost is added to the project and the work to the schedule.
 */
export function ChangeDecision({
  slug,
  id,
  number,
  cost,
  days,
}: {
  slug: string;
  id: string;
  /** Display number, e.g. CR-001. */
  number: string;
  /** Formatted additional cost. */
  cost: string;
  /** Formatted extra time, e.g. "3 days". */
  days: string;
}) {
  const t = useTranslations("portalEngagement.changes");
  const { pending, error, run, clear } = useRun();
  const [open, setOpen] = useState<"approved" | "rejected" | null>(null);
  const [note, setNote] = useState("");
  const errorText = useEngagementErrorText(error);

  const close = () => {
    clear();
    setOpen(null);
  };
  const confirm = () => {
    if (!open) return;
    run(
      () => decideChangeRequestAction(slug, id, { decision: open, note }),
      () => setOpen(null),
    );
  };

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => setOpen("approved")}>{t("approve")}</Button>
        <Button variant="outline" onClick={() => setOpen("rejected")}>
          {t("reject")}
        </Button>
      </div>
      <Dialog
        open={open !== null}
        onClose={close}
        title={open === "rejected" ? t("rejectTitle", { number }) : t("approveTitle", { number })}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {open === "rejected" ? t("rejectBody") : t("approveBody", { cost, days })}
          </p>
          <TextArea
            id={`cr-note-${id}`}
            label={t("noteLabel")}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
          />
          {errorText ? (
            <p role="alert" className="text-sm text-error">
              {errorText}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close}>
              {t("cancel")}
            </Button>
            <Button
              variant={open === "rejected" ? "danger" : "primary"}
              disabled={pending}
              onClick={confirm}
            >
              {open === "rejected" ? t("confirmReject") : t("confirmApprove")}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
