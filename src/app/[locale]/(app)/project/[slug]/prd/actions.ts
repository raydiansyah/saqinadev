"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { dismissPrdFindings, proposePrdUpdate } from "@/lib/brain/prd-findings";

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
