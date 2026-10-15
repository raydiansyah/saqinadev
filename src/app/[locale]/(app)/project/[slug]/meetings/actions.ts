"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { analyzeNote } from "@/lib/meetings/analyze";
import {
  reviewClientNote,
  teamCreateNote,
  teamDeleteNote,
  teamUpdateNote,
} from "@/lib/meetings/notes";
import { dismissItems, proposeFromNote } from "@/lib/meetings/propose";

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

export async function reviewNoteAction(slug: string, id: string, input: unknown) {
  return runAction("meeting.review", { slug, id }, async () => {
    await reviewClientNote(await requireActor(), slug, id, input);
    refresh();
  });
}

/** Reads a note with the platform's AI model. Returns whether a model was available. */
export async function analyzeNoteAction(slug: string, id: string, locale: string) {
  return runAction("meeting.analyze", { slug, id }, async () => {
    const result = await analyzeNote(
      await requireActor(),
      slug,
      id,
      isLocale(locale) ? locale : DEFAULT_LOCALE,
    );
    refresh();
    return { available: result.available, reason: result.available ? null : result.reason };
  });
}

/** One proposal from the selected findings; approving it is a separate step. */
export async function proposeNoteAction(slug: string, id: string, itemIds: string[]) {
  return runAction("meeting.propose", { slug, id }, async () => {
    const result = await proposeFromNote(await requireActor(), slug, id, { itemIds });
    refresh();
    return result;
  });
}

export async function dismissItemsAction(slug: string, id: string, itemIds: string[]) {
  return runAction("meeting.dismiss", { slug, id }, async () => {
    await dismissItems(await requireActor(), slug, id, { itemIds });
    refresh();
  });
}
