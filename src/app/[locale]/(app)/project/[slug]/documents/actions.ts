"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { runAction } from "@/lib/actions";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { requireActor } from "@/lib/auth/server";
import { getConflictRemote } from "@/lib/docsync/config";
import { pullFromGithub } from "@/lib/docsync/pull";
import { scheduleDocSync } from "@/lib/docsync/schedule";
import { generateBusinessDocument } from "@/lib/documents/business";
import {
  createDocument,
  saveDocument,
  setDocumentClientVisible,
  setDocumentStatus,
} from "@/lib/documents/service";
import { signAsTeam } from "@/lib/documents/signing";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function saveDocumentAction(
  slug: string,
  input: { docSlug: string; content: string; baseVersion: number },
) {
  return runAction("document.save", { slug, doc: input.docSlug }, async () => {
    const actor = await requireActor();
    // GitHub first: a project that follows GitHub reads it before the edit is saved, so a newer
    // file there reaches the editor as a version conflict instead of being overwritten.
    await loadProjectAccess(actor, { slug }, "content:write");
    await pullFromGithub({ slug }, 30_000);
    const row = await saveDocument(actor, slug, input);
    refresh();
    scheduleDocSync({ slug });
    return { version: row.version, updatedAt: row.updatedAt.toISOString() };
  });
}

export async function setDocumentStatusAction(slug: string, docSlug: string, status: string) {
  return runAction("document.status", { slug, doc: docSlug }, async () => {
    await setDocumentStatus(await requireActor(), slug, { docSlug, status });
    refresh();
    scheduleDocSync({ slug });
  });
}

export async function createDocumentAction(slug: string, title: string) {
  return runAction("document.create", { slug }, async () => {
    const result = await createDocument(await requireActor(), slug, { title });
    refresh();
    scheduleDocSync({ slug });
    return result;
  });
}

export async function setDocumentSharedAction(slug: string, docSlug: string, visible: boolean) {
  return runAction("document.share", { slug, doc: docSlug }, async () => {
    await setDocumentClientVisible(await requireActor(), slug, { docSlug, visible });
    refresh();
    scheduleDocSync({ slug });
  });
}

/** The repository's side of a sync conflict, for the compare dialog. */
export async function getDocConflictAction(slug: string, documentId: string) {
  return runAction("document.conflict", { slug, documentId }, async () =>
    getConflictRemote(await requireActor(), slug, documentId),
  );
}

/** Proposal, agreement, handover or maintenance agreement drafted from the project records. */
export async function generateBusinessDocumentAction(slug: string, kind: string) {
  return runAction("document.generate", { slug, kind }, async () => {
    const result = await generateBusinessDocument(
      await requireActor(),
      slug,
      { kind },
      await getLocale(),
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
