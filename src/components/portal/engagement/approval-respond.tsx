"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { respondApprovalAction } from "@/app/[locale]/(portal)/portal/projects/[slug]/approvals/actions";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/form";
import { EngagementError, useEngagementErrorText } from "./error";

/**
 * Approve in one tap (with an optional note), or ask for changes. Asking for changes
 * opens a required note so the team knows exactly what to change.
 */
export function ApprovalRespond({ slug, id }: { slug: string; id: string }) {
  const t = useTranslations("portalEngagement.approvals");
  const { pending, error, run, clear } = useRun();
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [note, setNote] = useState("");
  const noteError = error?.field === "engagement.noteRequired";
  const noteText = useEngagementErrorText(noteError ? error : null);

  const respond = (decision: "approved" | "changes_requested") =>
    run(() => respondApprovalAction(slug, id, { decision, note }));

  if (mode === "changes")
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          respond("changes_requested");
        }}
      >
        <TextArea
          id={`approval-note-${id}`}
          label={t("noteLabel")}
          hint={t("noteHint")}
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required
          minLength={3}
          maxLength={2000}
          error={noteText ?? undefined}
        />
        {noteError ? null : <EngagementError error={error} />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            onClick={() => {
              clear();
              setMode("idle");
            }}
          >
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {t("sendChanges")}
          </Button>
        </div>
      </form>
    );

  return (
    <div className="space-y-3">
      <TextArea
        id={`approval-optional-${id}`}
        label={t("optionalNoteLabel")}
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
      />
      <EngagementError error={error} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button disabled={pending} onClick={() => respond("approved")}>
          {t("approve")}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            clear();
            setMode("changes");
          }}
        >
          {t("requestChanges")}
        </Button>
      </div>
    </div>
  );
}
