"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { generateBusinessDocument } from "@/lib/documents/business";
import {
  createDocument,
  saveDocument,
  setDocumentClientVisible,
  setDocumentStatus,
} from "@/lib/documents/service";
import { signAsTeam } from "@/lib/documents/signing";
import { remindDocumentSignature } from "@/lib/reminders/manual";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function saveDocumentAction(
  slug: string,
  input: { docSlug: string; content: string; baseVersion: number },
) {
  return runAction("document.save", { slug, doc: input.docSlug }, async () => {
    const actor = await requireActor();
    const row = await saveDocument(actor, slug, input);
    refresh();
    return { version: row.version, updatedAt: row.updatedAt.toISOString() };
  });
}

export async function setDocumentStatusAction(slug: string, docSlug: string, status: string) {
  return runAction("document.status", { slug, doc: docSlug }, async () => {
    await setDocumentStatus(await requireActor(), slug, { docSlug, status });
    refresh();
  });
}

export async function createDocumentAction(slug: string, title: string) {
  return runAction("document.create", { slug }, async () => {
    const result = await createDocument(await requireActor(), slug, { title });
    refresh();
    return result;
  });
}

export async function setDocumentSharedAction(slug: string, docSlug: string, visible: boolean) {
  return runAction("document.share", { slug, doc: docSlug }, async () => {
    await setDocumentClientVisible(await requireActor(), slug, { docSlug, visible });
    refresh();
  });
}

/** Proposal, agreement, handover or maintenance agreement drafted from the project records. */
export async function generateBusinessDocumentAction(slug: string, kind: string, locale: string) {
  return runAction("document.generate", { slug, kind }, async () => {
    const result = await generateBusinessDocument(
      await requireActor(),
      slug,
      { kind },
      // The locale comes from the page: root params cannot be read inside a Server Action.
      isLocale(locale) ? locale : DEFAULT_LOCALE,
    );
    refresh();
    return result;
  });
}

/** The team signs the approved version of a proposal, agreement, handover or maintenance agreement. */
export async function signDocumentAction(slug: string, docSlug: string) {
  return runAction("document.sign", { slug, doc: docSlug }, async () => {
    const result = await signAsTeam(await requireActor(), slug, docSlug);
    refresh();
    return result;
  });
}

/** A reminder to the client now, for an agreement they have not signed. Once per day. */
export async function remindSignatureAction(slug: string, docSlug: string) {
  return runAction("document.remind", { slug, doc: docSlug }, async () =>
    remindDocumentSignature(await requireActor(), slug, docSlug),
  );
}
