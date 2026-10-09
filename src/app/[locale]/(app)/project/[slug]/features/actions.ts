"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import {
  createScopeItem,
  deleteScopeItem,
  seedScopeFromRequirements,
  updateScopeItem,
} from "@/lib/scope/service";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function createScopeAction(slug: string, input: unknown) {
  return runAction("scope.create", { slug }, async () => {
    const item = await createScopeItem(await requireActor(), slug, input);
    refresh();
    return { id: item.id };
  });
}

export async function updateScopeAction(slug: string, id: string, input: unknown) {
  return runAction("scope.update", { slug, id }, async () => {
    await updateScopeItem(await requireActor(), slug, id, input);
    refresh();
  });
}

export async function deleteScopeAction(slug: string, id: string) {
  return runAction("scope.delete", { slug, id }, async () => {
    await deleteScopeItem(await requireActor(), slug, id);
    refresh();
  });
}

export async function seedScopeAction(slug: string) {
  return runAction("scope.seed", { slug }, async () => {
    const added = await seedScopeFromRequirements(await requireActor(), slug);
    refresh();
    return { added };
  });
}
