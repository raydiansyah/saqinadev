import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { meetingNotes } from "@/lib/db/schema";
import type { Party } from "@/lib/engagement/shared";
import { teamParty } from "@/lib/engagement/shared";
import { AppError } from "@/lib/errors";
import { allow } from "@/lib/rate-limit";
import { parse } from "@/lib/validation";
import { noteInput, noteUpdate } from "./schema";

export type MeetingNote = typeof meetingNotes.$inferSelect;

const uuid = z.uuid();
const HOUR = 60 * 60 * 1000;

/** Team notes are saved ready for analysis; client notes (added later) start in review. */
async function createNote(party: Party, input: unknown) {
  const data = parse(noteInput, input);
  if (!(await allow(`meeting:${party.actor.id}`, 30, HOUR))) throw new AppError("RATE_LIMIT");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(meetingNotes)
      .values({
        ...data,
        projectId: party.project.id,
        authorId: party.actor.id,
        side: party.side,
        status: "ready",
      })
      .returning({ id: meetingNotes.id });
    await recordActivity(tx, {
      projectId: party.project.id,
      actorId: party.actor.id,
      type: "meeting_note.submitted",
      entityType: "meeting_note",
      entityId: row.id,
      metadata: { title: data.title, side: party.side },
    });
    return { id: row.id };
  });
}

/** Written by a project member. */
export async function teamCreateNote(actor: Actor, slug: string, input: unknown) {
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  return createNote(teamParty(access), input);
}

export async function listNotes(projectId: string): Promise<MeetingNote[]> {
  return db
    .select()
    .from(meetingNotes)
    .where(eq(meetingNotes.projectId, projectId))
    .orderBy(desc(meetingNotes.meetingDate), desc(meetingNotes.createdAt))
    .limit(200);
}

/** An analyzed note is a record of what was proposed; it can no longer be rewritten. */
function assertEditable(note: MeetingNote) {
  if (note.status === "analyzed")
    throw new AppError("CONFLICT", "Note already analyzed", { status: "meeting.analyzed" });
}

export async function teamUpdateNote(actor: Actor, slug: string, id: string, input: unknown) {
  const data = parse(noteUpdate, input);
  if (!uuid.safeParse(id).success) throw new AppError("NOT_FOUND");
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [note] = await tx
      .select()
      .from(meetingNotes)
      .where(and(eq(meetingNotes.id, id), eq(meetingNotes.projectId, access.project.id)))
      .for("update");
    if (!note) throw new AppError("NOT_FOUND");
    assertEditable(note);
    await tx.update(meetingNotes).set(data).where(eq(meetingNotes.id, id));
    await recordActivity(tx, {
      projectId: access.project.id,
      actorId: actor.id,
      type: "meeting_note.updated",
      entityType: "meeting_note",
      entityId: id,
      metadata: { title: data.title ?? note.title },
    });
  });
}

export async function teamDeleteNote(actor: Actor, slug: string, id: string) {
  if (!uuid.safeParse(id).success) throw new AppError("NOT_FOUND");
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [note] = await tx
      .select()
      .from(meetingNotes)
      .where(and(eq(meetingNotes.id, id), eq(meetingNotes.projectId, access.project.id)))
      .for("update");
    if (!note) throw new AppError("NOT_FOUND");
    assertEditable(note);
    await tx.delete(meetingNotes).where(eq(meetingNotes.id, id));
    await recordActivity(tx, {
      projectId: access.project.id,
      actorId: actor.id,
      type: "meeting_note.deleted",
      entityType: "meeting_note",
      entityId: null,
      metadata: { title: note.title },
    });
  });
}
