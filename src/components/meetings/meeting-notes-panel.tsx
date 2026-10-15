"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { deleteNoteAction } from "@/app/[locale]/(app)/project/[slug]/meetings/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Chip, type ChipTone } from "@/components/engagement/chip";
import { useEngagementErrorText } from "@/components/engagement/engagement-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import type { MeetingNoteStatus, MeetingVisibility } from "@/lib/domain/business";
import { formatRelative } from "@/lib/format";
import { NoteDialog, type NoteDraft } from "./note-dialog";

export interface NoteView extends NoteDraft {
  side: "client" | "team";
  status: MeetingNoteStatus;
  createdAt: string;
}

const STATUS_TONE: Record<MeetingNoteStatus, ChipTone> = {
  ready: "neutral",
  pending_review: "warning",
  approved_for_analysis: "info",
  declined: "muted",
  analyzed: "success",
};

export function NewNoteButton({ slug }: { slug: string }) {
  const t = useTranslations("meetings");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("add")}</Button>
      {open ? <NoteDialog slug={slug} open onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const VISIBILITY_TONE: Record<MeetingVisibility, ChipTone> = {
  internal: "neutral",
  shared: "info",
};

/** The team's list of meeting notes, newest meeting first. */
export function MeetingNotesPanel({
  slug,
  notes,
  canWrite,
}: {
  slug: string;
  notes: NoteView[];
  canWrite: boolean;
}) {
  const t = useTranslations("meetings");
  const locale = useLocale();
  const [editing, setEditing] = useState<NoteView | null>(null);
  const [deleting, setDeleting] = useState<NoteView | null>(null);
  const { pending, error, run, clear } = useRun();
  const errorText = useEngagementErrorText(error);

  if (notes.length === 0)
    return (
      <p className="rounded-lg border border-dashed border-border-strong px-6 py-8 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );

  return (
    <>
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-medium text-balance">{n.title}</h2>
                <p className="mt-1 text-xs text-subtle-foreground">
                  <time dateTime={n.meetingDate}>{n.meetingDate}</time>
                  {" · "}
                  {formatRelative(new Date(n.createdAt), locale)}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip tone="neutral">{t(`side.${n.side}`)}</Chip>
                <Chip tone={VISIBILITY_TONE[n.visibility]}>{t(`visibility.${n.visibility}`)}</Chip>
                <Chip tone={STATUS_TONE[n.status]}>{t(`status.${n.status}`)}</Chip>
              </div>
            </div>
            {n.attendees ? (
              <p className="mt-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{t("attendeesLabel")}: </span>
                {n.attendees}
              </p>
            ) : null}
            <p className="mt-3 text-sm whitespace-pre-wrap">{n.body}</p>
            {canWrite && n.status !== "analyzed" ? (
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(n)}>
                  {t("edit")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleting(n)}>
                  {t("delete")}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {editing ? (
        <NoteDialog slug={slug} open note={editing} onClose={() => setEditing(null)} />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={t("deleteTitle")}
        body={t("deleteBody", { title: deleting?.title ?? "" })}
        confirmLabel={t("deleteConfirm")}
        pending={pending}
        error={errorText}
        onConfirm={() => {
          if (deleting)
            run(
              () => deleteNoteAction(slug, deleting.id),
              () => setDeleting(null),
            );
        }}
        onClose={() => {
          clear();
          setDeleting(null);
        }}
      />
    </>
  );
}
