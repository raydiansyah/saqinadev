"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { clientConfirmNote, clientCreateNote, clientDeleteNote } from "@/lib/meetings/notes";

const refresh = () => revalidatePath("/[locale]/portal/projects/[slug]", "layout");

export async function createNoteAction(slug: string, input: unknown) {
  return runAction("portal.meeting.create", { slug }, async () => {
    const result = await clientCreateNote(await requireActor(), String(slug), input);
    refresh();
    return result;
  });
}

export async function confirmNoteAction(slug: string, id: string) {
  return runAction("portal.meeting.confirm", { slug, id }, async () => {
    await clientConfirmNote(await requireActor(), String(slug), String(id));
    refresh();
  });
}

export async function withdrawNoteAction(slug: string, id: string) {
  return runAction("portal.meeting.withdraw", { slug, id }, async () => {
    await clientDeleteNote(await requireActor(), String(slug), String(id));
    refresh();
  });
}
