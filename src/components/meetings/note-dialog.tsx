"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import {
  createNoteAction,
  updateNoteAction,
} from "@/app/[locale]/(app)/project/[slug]/meetings/actions";
import { Dialog } from "@/components/app/dialog";
import { EngagementError } from "@/components/engagement/engagement-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field, Select, TextArea } from "@/components/ui/form";
import { MEETING_VISIBILITIES, type MeetingVisibility } from "@/lib/domain/business";

export interface NoteDraft {
  id: string;
  title: string;
  meetingDate: string;
  attendees: string;
  body: string;
  visibility: MeetingVisibility;
}

/** Create (no `note`) or edit a meeting note. */
export function NoteDialog({
  slug,
  open,
  note,
  onClose,
}: {
  slug: string;
  open: boolean;
  note?: NoteDraft;
  onClose: () => void;
}) {
  const t = useTranslations("meetings");
  const id = useId();
  const { pending, error, run, clear } = useRun();
  const close = () => {
    clear();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={note ? t("editTitle") : t("addTitle")}
      className="max-w-2xl"
    >
      <form
        className="space-y-4"
        action={(form) => {
          const input = {
            title: String(form.get("title") ?? ""),
            meetingDate: String(form.get("meetingDate") ?? ""),
            attendees: String(form.get("attendees") ?? ""),
            body: String(form.get("body") ?? ""),
            visibility: String(form.get("visibility") ?? "internal"),
          };
          run(
            () => (note ? updateNoteAction(slug, note.id, input) : createNoteAction(slug, input)),
            close,
          );
        }}
      >
        <Field
          id={`${id}-title`}
          name="title"
          label={t("fields.title")}
          placeholder={t("placeholders.title")}
          defaultValue={note?.title}
          required
          minLength={3}
          maxLength={160}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id={`${id}-date`}
            name="meetingDate"
            type="date"
            label={t("fields.date")}
            defaultValue={note?.meetingDate ?? new Date().toISOString().slice(0, 10)}
            required
          />
          <Select
            id={`${id}-vis`}
            name="visibility"
            label={t("fields.visibility")}
            defaultValue={note?.visibility ?? "internal"}
          >
            {MEETING_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {t(`visibility.${v}`)}
              </option>
            ))}
          </Select>
        </div>
        <Field
          id={`${id}-att`}
          name="attendees"
          label={t("fields.attendees")}
          placeholder={t("placeholders.attendees")}
          defaultValue={note?.attendees}
          maxLength={500}
        />
        <TextArea
          id={`${id}-body`}
          name="body"
          label={t("fields.body")}
          placeholder={t("placeholders.body")}
          hint={t("bodyHint")}
          defaultValue={note?.body}
          rows={10}
          required
          minLength={10}
          maxLength={20000}
        />
        <EngagementError error={error} />
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close}>
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
