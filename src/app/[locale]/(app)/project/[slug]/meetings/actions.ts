"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { analyzeNote } from "@/lib/meetings/analyze";
import {
  reviewClientNote,
  teamCreateNote,
  teamDeleteNote,
  teamUpdateNote,
} from "@/lib/meetings/notes";

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
export async function analyzeNoteAction(slug: string, id: string) {
  return runAction("meeting.analyze", { slug, id }, async () => {
    const result = await analyzeNote(await requireActor(), slug, id, (await getLocale()) as Locale);
    refresh();
    return { available: result.available };
  });
}
