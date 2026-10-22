"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { dismissPrdFindings, proposePrdUpdate } from "@/lib/brain/prd-findings";
import { choosePrd, createPrdFromText } from "@/lib/imports/choose-prd";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function proposePrdUpdateAction(slug: string, ids: string[]) {
  return runAction("prd.proposeUpdate", { slug }, async () => {
    const result = await proposePrdUpdate(await requireActor(), slug, { ids });
    refresh();
    return result;
  });
}

export async function dismissPrdFindingsAction(slug: string, ids: string[]) {
  return runAction("prd.dismissFindings", { slug }, async () => {
    await dismissPrdFindings(await requireActor(), slug, { ids });
    refresh();
  });
}

/** The person says which repository document is the PRD. */
export async function choosePrdAction(slug: string, docSlug: string) {
  return runAction("prd.choose", { slug, doc: docSlug }, async () => {
    await choosePrd(await requireActor(), slug, { docSlug });
    refresh();
  });
}

/** The PRD pasted or uploaded by hand. */
export async function createPrdFromTextAction(slug: string, content: string) {
  return runAction("prd.create_text", { slug }, async () => {
    await createPrdFromText(await requireActor(), slug, { content });
    refresh();
  });
}
