import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { meetingNotes } from "@/lib/db/schema";
import type { Party } from "@/lib/engagement/shared";
import { clientParty, portalHref, teamHref, teamParty } from "@/lib/engagement/shared";
import { AppError } from "@/lib/errors";
import { clientRecipients, deliver, notifyTx, teamRecipients } from "@/lib/notifications/service";
import { allow } from "@/lib/rate-limit";
import { parse } from "@/lib/validation";
import { clientNoteInput, noteInput, noteUpdate, reviewInput } from "./schema";

export type MeetingNote = typeof meetingNotes.$inferSelect;

const uuid = z.uuid();
const HOUR = 60 * 60 * 1000;

const rule = (status: string) => new AppError("CONFLICT", undefined, { status });

/**
 * Team notes are saved ready for analysis. A client note starts in review and is always shown
 * to the client who wrote it; the client has no say in visibility or in analysis.
 */
async function createNote(party: Party, input: unknown) {
  const client = party.side === "client";
  const data = client
    ? { ...parse(clientNoteInput, input), visibility: "shared" as const }
    : parse(noteInput, input);
  if (!(await allow(`meeting:${party.actor.id}`, 30, HOUR))) throw new AppError("RATE_LIMIT");
  const { id, pending } = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(meetingNotes)
      .values({
        ...data,
        projectId: party.project.id,
        authorId: party.actor.id,
        side: party.side,
        status: client ? "pending_review" : "ready",
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
    const params = { title: data.title, project: party.project.name };
    const pending = client
      ? await notifyTx(tx, {
          userIds: await teamRecipients(tx, party.project.id),
          projectId: party.project.id,
          type: "meeting_note.submitted",
          params,
          href: teamHref(party.project.slug, "/meetings"),
          dedupKey: `meeting-note:${row.id}`,
        })
      : data.visibility === "shared"
        ? await notifyTx(tx, {
            userIds: await clientRecipients(tx, party.project.id),
            projectId: party.project.id,
            type: "meeting_note.shared",
            params,
            href: portalHref(party.project.slug, "/meetings"),
            dedupKey: `meeting-note:${row.id}:shared`,
          })
        : null;
    return { id: row.id, pending };
  });
  if (pending) await deliver(pending);
  return { id };
}

/** Written by a project member. */
export async function teamCreateNote(actor: Actor, slug: string, input: unknown) {
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  return createNote(teamParty(access), input);
}

/** Written on the client portal; waits for team review. */
export async function clientCreateNote(actor: Actor, slug: string, input: unknown) {
  return createNote(await clientParty(actor, slug), input);
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
  if (note.status === "analyzed") throw rule("meeting.analyzed");
}

async function lockNote(tx: Tx, projectId: string, id: string): Promise<MeetingNote> {
  const [note] = await tx
    .select()
    .from(meetingNotes)
    .where(and(eq(meetingNotes.id, id), eq(meetingNotes.projectId, projectId)))
    .for("update");
  if (!note) throw new AppError("NOT_FOUND");
  return note;
}

export async function teamUpdateNote(actor: Actor, slug: string, id: string, input: unknown) {
  const data = parse(noteUpdate, input);
  if (!uuid.safeParse(id).success) throw new AppError("NOT_FOUND");
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const note = await lockNote(tx, access.project.id, id);
    assertEditable(note);
    // A client note keeps its visibility: it is always shown to its author.
    const { visibility, ...rest } = data;
    await tx
      .update(meetingNotes)
      .set(note.side === "client" ? rest : { ...rest, ...(visibility ? { visibility } : {}) })
      .where(eq(meetingNotes.id, id));
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
    const note = await lockNote(tx, access.project.id, id);
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

/**
 * The team decides whether a client note may be analyzed. Declining needs a reason the client
 * will read. Nothing is analyzed or proposed here.
 */
export async function reviewClientNote(actor: Actor, slug: string, id: string, input: unknown) {
  const data = parse(reviewInput, input);
  if (!uuid.safeParse(id).success) throw new AppError("NOT_FOUND");
  if (data.decision === "decline" && data.note.length < 5)
    throw new AppError("VALIDATION_ERROR", undefined, { note: "meeting.reasonRequired" });
  const pending = await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const note = await lockNote(tx, access.project.id, id);
    if (note.side !== "client" || note.status !== "pending_review")
      throw rule("meeting.notPending");
    const approved = data.decision === "approve";
    await tx
      .update(meetingNotes)
      .set({
        status: approved ? "approved_for_analysis" : "declined",
        reviewedBy: actor.id,
        reviewedAt: new Date(),
        reviewNote: data.note || null,
      })
      .where(eq(meetingNotes.id, id));
    await recordActivity(tx, {
      projectId: access.project.id,
      actorId: actor.id,
      type: "meeting_note.reviewed",
      entityType: "meeting_note",
      entityId: id,
      metadata: { title: note.title, decision: data.decision },
    });
    return notifyTx(tx, {
      userIds: await clientRecipients(tx, access.project.id),
      projectId: access.project.id,
      type: approved ? "meeting_note.accepted" : "meeting_note.declined",
      params: { title: note.title, project: access.project.name },
      href: portalHref(access.project.slug, "/meetings"),
      dedupKey: `meeting-note:${id}:${data.decision}`,
    });
  });
  await deliver(pending);
}

/** The client confirms a shared team note is accurate. Only shared team notes can be confirmed. */
export async function clientConfirmNote(actor: Actor, slug: string, id: string) {
  if (!uuid.safeParse(id).success) throw new AppError("NOT_FOUND");
  const party = await clientParty(actor, slug);
  const pending = await db.transaction(async (tx) => {
    const note = await lockNote(tx, party.project.id, id);
    // Internal notes do not exist as far as the client is concerned.
    if (note.side !== "team" || note.visibility !== "shared") throw new AppError("NOT_FOUND");
    if (note.clientConfirmedAt) return null;
    await tx
      .update(meetingNotes)
      .set({ clientConfirmedAt: new Date(), clientConfirmedBy: actor.id })
      .where(eq(meetingNotes.id, id));
    await recordActivity(tx, {
      projectId: party.project.id,
      actorId: actor.id,
      type: "meeting_note.confirmed",
      entityType: "meeting_note",
      entityId: id,
      metadata: { title: note.title },
    });
    return notifyTx(tx, {
      userIds: await teamRecipients(tx, party.project.id),
      projectId: party.project.id,
      type: "meeting_note.confirmed",
      params: { title: note.title, project: party.project.name },
      href: teamHref(party.project.slug, "/meetings"),
      dedupKey: `meeting-note:${id}:confirmed`,
    });
  });
  if (pending) await deliver(pending);
}

/** A client may withdraw their own note while it is still waiting for review. */
export async function clientDeleteNote(actor: Actor, slug: string, id: string) {
  if (!uuid.safeParse(id).success) throw new AppError("NOT_FOUND");
  const party = await clientParty(actor, slug);
  await db.transaction(async (tx) => {
    const note = await lockNote(tx, party.project.id, id);
    if (note.side !== "client" || note.authorId !== actor.id) throw new AppError("NOT_FOUND");
    if (note.status !== "pending_review") throw rule("meeting.notPending");
    await tx.delete(meetingNotes).where(eq(meetingNotes.id, id));
    await recordActivity(tx, {
      projectId: party.project.id,
      actorId: actor.id,
      type: "meeting_note.deleted",
      entityType: "meeting_note",
      entityId: null,
      metadata: { title: note.title },
    });
  });
}
