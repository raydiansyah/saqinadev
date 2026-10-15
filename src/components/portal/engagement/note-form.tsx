"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { createNoteAction } from "@/app/[locale]/(portal)/portal/projects/[slug]/meetings/actions";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field, Notice, TextArea } from "@/components/ui/form";
import { EngagementError } from "./error";

/** A client note. It goes to the team for review; the client does not choose who sees it. */
export function NoteForm({ slug }: { slug: string }) {
  const t = useTranslations("portalEngagement.meetings");
  const { pending, error, run } = useRun();
  const [sent, setSent] = useState(false);

  return (
    <form
      key={String(sent)}
      className="space-y-5 rounded-lg border border-border bg-surface p-5"
      action={(form) => {
        setSent(false);
        run(
          () =>
            createNoteAction(slug, {
              title: String(form.get("title") ?? ""),
              meetingDate: String(form.get("meetingDate") ?? ""),
              attendees: String(form.get("attendees") ?? ""),
              body: String(form.get("body") ?? ""),
            }),
          () => setSent(true),
        );
      }}
    >
      <h3 className="font-medium">{t("formTitle")}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="note-title"
          name="title"
          label={t("titleLabel")}
          placeholder={t("titlePlaceholder")}
          required
          minLength={3}
          maxLength={160}
        />
        <Field
          id="note-date"
          name="meetingDate"
          type="date"
          label={t("dateLabel")}
          defaultValue={new Date().toISOString().slice(0, 10)}
          required
        />
      </div>
      <Field
        id="note-attendees"
        name="attendees"
        label={t("attendeesLabel")}
        placeholder={t("attendeesPlaceholder")}
        maxLength={500}
      />
      <TextArea
        id="note-body"
        name="body"
        label={t("bodyLabel")}
        placeholder={t("bodyPlaceholder")}
        hint={t("bodyHint")}
        rows={6}
        required
        minLength={10}
        maxLength={20000}
      />
      <EngagementError error={error} />
      {sent && !error ? (
        <Notice tone="success">
          {t("sent")}
        </Notice>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? t("sending") : t("send")}
      </Button>
    </form>
  );
}
