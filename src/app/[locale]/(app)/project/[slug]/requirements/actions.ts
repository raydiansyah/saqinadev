"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import {
  createRequirement,
  deleteRequirement,
  updateRequirement,
} from "@/lib/requirements/service";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function createRequirementAction(slug: string, input: unknown) {
  return runAction("requirement.create", { slug }, async () => {
    await createRequirement(await requireActor(), slug, input);
    refresh();
  });
}

export async function updateRequirementAction(slug: string, input: unknown) {
  return runAction("requirement.update", { slug }, async () => {
    await updateRequirement(await requireActor(), slug, input);
    refresh();
  });
}

export async function deleteRequirementAction(slug: string, id: string) {
  return runAction("requirement.delete", { slug }, async () => {
    await deleteRequirement(await requireActor(), slug, { id });
    refresh();
  });
}
