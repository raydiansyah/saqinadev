"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { teamCreateNote, teamDeleteNote, teamUpdateNote } from "@/lib/meetings/notes";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function createNoteAction(slug: string, input: unknown) {
  return runAction("meeting.create", { slug }, async () => {
    const result = await teamCreateNote(await requireActor(), slug, input);
    refresh();
    return result;
  });
}

export async function updateNoteAction(slug: string, id: string, input: unknown) {
  return runAction("meeting.update", { slug, id }, async () => {
    await teamUpdateNote(await requireActor(), slug, id, input);
    refresh();
  });
}

export async function deleteNoteAction(slug: string, id: string) {
  return runAction("meeting.delete", { slug, id }, async () => {
    await teamDeleteNote(await requireActor(), slug, id);
    refresh();
  });
}
