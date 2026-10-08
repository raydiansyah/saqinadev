"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { createDecision, setDecisionStatus } from "@/lib/decisions/service";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function createDecisionAction(slug: string, input: unknown) {
  return runAction("decision.create", { slug }, async () => {
    await createDecision(await requireActor(), slug, input);
    refresh();
  });
}

export async function setDecisionStatusAction(slug: string, input: unknown) {
  return runAction("decision.status", { slug }, async () => {
    await setDecisionStatus(await requireActor(), slug, input);
    refresh();
  });
}
