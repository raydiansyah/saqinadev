"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { dismissPrdFindings, proposePrdUpdate } from "@/lib/brain/prd-findings";
import { choosePrd, createPrdFromText } from "@/lib/imports/choose-prd";
import { enhancePrdSection, savePrdBrief } from "@/lib/prd/service";

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

/** Enhance one section of the Generate PRD form (a model when set up, else rules). */
export async function enhancePrdSectionAction(slug: string, input: unknown) {
  return runAction("prd.enhance", { slug }, async () =>
    enhancePrdSection(await requireActor(), slug, input),
  );
}

/** Saves the Generate PRD form as the PRD (first version, or a new one). */
export async function savePrdBriefAction(slug: string, input: unknown) {
  return runAction("prd.generate", { slug }, async () => {
    const result = await savePrdBrief(await requireActor(), slug, input);
    refresh();
    return result;
  });
}
