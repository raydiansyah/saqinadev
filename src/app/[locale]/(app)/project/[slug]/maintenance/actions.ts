"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { createPlan, renewPlan, setWarranty, updatePlan } from "@/lib/maintenance/service";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function setWarrantyAction(slug: string, input: unknown) {
  return runAction("maintenance.warranty", { slug }, async () => {
    await setWarranty(await requireActor(), slug, input);
    refresh();
  });
}

export async function createPlanAction(slug: string, input: unknown) {
  return runAction("maintenance.create", { slug }, async () => {
    const result = await createPlan(await requireActor(), slug, input);
    refresh();
    return result;
  });
}

export async function updatePlanAction(slug: string, id: string, input: unknown) {
  return runAction("maintenance.update", { slug, id }, async () => {
    await updatePlan(await requireActor(), slug, id, input);
    refresh();
  });
}

export async function renewPlanAction(slug: string, id: string) {
  return runAction("maintenance.renew", { slug, id }, async () => {
    const result = await renewPlan(await requireActor(), slug, id);
    refresh();
    return result;
  });
}
