"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
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
