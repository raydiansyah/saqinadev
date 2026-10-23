"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { requestChangesAsClient, signAsClient } from "@/lib/documents/signing";

const refresh = () => revalidatePath("/[locale]/portal/projects/[slug]", "layout");

/** The client signs the approved version they can read. */
export async function signDocumentClientAction(slug: string, docSlug: string) {
  return runAction("portal.document.sign", { slug, doc: docSlug }, async () => {
    const result = await signAsClient(await requireActor(), slug, docSlug);
    refresh();
    return result;
  });
}

/** The client does not agree: the document goes back to the team with a note. */
export async function requestDocumentChangesAction(slug: string, docSlug: string, note: string) {
  return runAction("portal.document.changes", { slug, doc: docSlug }, async () => {
    await requestChangesAsClient(await requireActor(), slug, docSlug, { note });
    refresh();
  });
}
