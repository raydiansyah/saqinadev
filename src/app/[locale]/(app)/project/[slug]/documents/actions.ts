"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { generateBusinessDocument } from "@/lib/documents/business";
import {
  createDocument,
  saveDocument,
  setDocumentClientVisible,
  setDocumentStatus,
} from "@/lib/documents/service";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function saveDocumentAction(
  slug: string,
  input: { docSlug: string; content: string; baseVersion: number },
) {
  return runAction("document.save", { slug, doc: input.docSlug }, async () => {
    const row = await saveDocument(await requireActor(), slug, input);
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
