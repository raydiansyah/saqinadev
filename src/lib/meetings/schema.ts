import * as z from "zod";
import { MEETING_VISIBILITIES } from "@/lib/domain/business";

// Plain text only. Control characters (except newline and tab) are dropped.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const text = (min: number, max: number) =>
  z
    .string()
    .transform((s) => s.replace(CONTROL, "").trim())
    .pipe(z.string().min(min).max(max));

export const NOTE_BODY_MAX = 20_000;

export const noteInput = z.object({
  title: text(3, 160),
  meetingDate: z.iso.date(),
  attendees: text(0, 500).default(""),
  body: text(10, NOTE_BODY_MAX),
  visibility: z.enum(MEETING_VISIBILITIES).default("internal"),
});

export const noteUpdate = noteInput.partial();

/** The client has no visibility choice: what they write is shown to them and to the team. */
export const clientNoteInput = noteInput.omit({ visibility: true });

export const reviewInput = z.object({
  decision: z.enum(["approve", "decline"]),
  note: text(0, 1000).default(""),
});

export type NoteInput = z.output<typeof noteInput>;
