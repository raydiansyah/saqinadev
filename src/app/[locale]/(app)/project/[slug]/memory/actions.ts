"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { createMemory, updateMemory } from "@/lib/memory/service";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function createMemoryAction(slug: string, input: unknown) {
  return runAction("memory.create", { slug }, async () => {
    await createMemory(await requireActor(), slug, input);
    refresh();
  });
}

export async function updateMemoryAction(slug: string, input: unknown) {
  return runAction("memory.update", { slug }, async () => {
    await updateMemory(await requireActor(), slug, input);
    refresh();
  });
}
