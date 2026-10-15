import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import type { PlannedAction } from "@/lib/assistant/actions/types";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { meetingNoteItems, meetingNotes } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { createProposalTx } from "@/lib/proposals/repository";
import { listRequirements } from "@/lib/requirements/service";
import { listTasks } from "@/lib/tasks/service";
import { parse } from "@/lib/validation";
import type { MeetingItem } from "./analyze";
import type { MeetingNote } from "./notes";

/**
 * Turns selected findings into ONE proposal for the team to approve. Nothing is applied here:
 * `approveProposal` runs the actions, and only for a member with write access. Findings that
 * are duplicates, conflicts or unclear never become actions; they stay as findings.
 */

const input = z.object({ itemIds: z.array(z.uuid()).min(1).max(25) });

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const source = (note: Pick<MeetingNote, "title" | "meetingDate">, quote: string) =>
  `From meeting note “${note.title}” (${note.meetingDate})${quote ? `: “${quote}”` : "."}`;
const append = (current: string, addition: string, max: number) =>
  clip(current ? `${current}\n\n${addition}` : addition, max);

export const ACTIONABLE = ["new_in_scope", "revision", "out_of_scope", "info"] as const;

interface Existing {
  requirements: Map<string, Awaited<ReturnType<typeof listRequirements>>[number]>;
  tasks: Map<string, Awaited<ReturnType<typeof listTasks>>[number]>;
}

/** The action for one finding, or null when it cannot be applied safely. */
function toAction(
  item: MeetingItem,
  note: MeetingNote,
  key: string,
  existing: Existing,
): PlannedAction | null {
  const from = source(note, item.quote);
  const detail = [item.text, item.rationale].filter(Boolean).join("\n");
  switch (item.classification) {
    case "new_in_scope":
      return {
        type: "CREATE_REQUIREMENT",
        key,
        payload: {
          group: "features",
          title: clip(item.text, 160),
          description: clip(`${item.text}\n\n${from}`, 2000),
          priority: "medium",
          // A meeting remark is not yet a confirmed requirement; the team confirms it later.
          status: "inferred",
        },
      };
    case "revision": {
      if (item.matchedType === "requirement" && item.matchedId) {
        const r = existing.requirements.get(item.matchedId);
        if (!r) return null;
        return {
          type: "UPDATE_REQUIREMENT",
          key,
          payload: { id: r.id, description: append(r.description, `${item.text}\n${from}`, 2000) },
          before: {
            title: r.title,
            description: r.description,
            priority: r.priority,
            status: r.status,
          },
        };
      }
      if (item.matchedType === "task" && item.matchedId) {
        const t = existing.tasks.get(item.matchedId);
        if (!t) return null;
        return {
          type: "UPDATE_TASK",
          key,
          payload: { id: t.id, description: append(t.description, `${item.text}\n${from}`, 4000) },
          before: { title: t.title, priority: t.priority, status: t.status },
        };
      }
      return null;
    }
    case "out_of_scope":
      return {
        type: "CREATE_CHANGE_REQUEST",
        key,
        payload: {
          title: clip(item.text.padEnd(3, "."), 160),
          description: clip(`${item.text}\n\n${from}`, 4000),
          impact: clip(item.rationale, 2000),
        },
      };
    case "info":
      return {
        type: "CREATE_MEMORY",
        key,
        payload: {
          title: clip(item.text.padEnd(2, "."), 160),
          content: clip(`${detail}\n\n${from}`, 4000),
          category: "business",
          importance: "normal",
        },
      };
    default:
      return null;
  }
}

export async function proposeFromNote(actor: Actor, slug: string, id: string, raw: unknown) {
  const { itemIds } = parse(input, raw);
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND");
  const batch = new EventBatch();
  const proposalId = await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [note] = await tx
      .select()
      .from(meetingNotes)
      .where(and(eq(meetingNotes.id, id), eq(meetingNotes.projectId, access.project.id)))
      .for("update");
    if (!note) throw new AppError("NOT_FOUND");
    if (note.status !== "analyzed")
      throw new AppError("CONFLICT", undefined, { status: "meeting.notAnalyzed" });

    const items = await tx
      .select()
      .from(meetingNoteItems)
      .where(and(eq(meetingNoteItems.noteId, id), inArray(meetingNoteItems.id, itemIds)))
      .orderBy(meetingNoteItems.position)
      .for("update");
    if (items.length !== new Set(itemIds).size) throw new AppError("NOT_FOUND");
    if (items.some((i) => i.proposalId || i.dismissedAt))
      throw new AppError("CONFLICT", undefined, { status: "meeting.itemTaken" });

    const existing: Existing = {
      requirements: new Map((await listRequirements(access)).map((r) => [r.id, r])),
      tasks: new Map((await listTasks(access)).map((t) => [t.id, t])),
    };
    const actions = items.map((item, i) => toAction(item, note, `m${i + 1}`, existing));
    if (actions.some((a) => a === null))
      throw new AppError("VALIDATION_ERROR", undefined, { itemIds: "meeting.notActionable" });

    const proposal = await createProposalTx(
      tx,
      access,
      {
        type: "meeting_note",
        title: clip(`Meeting note: ${note.title}`, 200),
        description: `Findings from the meeting note “${note.title}” (${note.meetingDate}).`,
        actions: actions as PlannedAction[],
      },
      batch,
    );
    await tx
      .update(meetingNoteItems)
      .set({ proposalId: proposal.id })
      .where(inArray(meetingNoteItems.id, itemIds));
    return proposal.id;
  });
  batch.flush();
  return { proposalId };
}

/** Marks findings the team does not want to act on. They stay visible as findings. */
export async function dismissItems(actor: Actor, slug: string, id: string, raw: unknown) {
  const { itemIds } = parse(input, raw);
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND");
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [note] = await tx
      .select({ id: meetingNotes.id })
      .from(meetingNotes)
      .where(and(eq(meetingNotes.id, id), eq(meetingNotes.projectId, access.project.id)));
    if (!note) throw new AppError("NOT_FOUND");
    await tx
      .update(meetingNoteItems)
      .set({ dismissedAt: new Date() })
      .where(and(eq(meetingNoteItems.noteId, id), inArray(meetingNoteItems.id, itemIds)));
  });
}
