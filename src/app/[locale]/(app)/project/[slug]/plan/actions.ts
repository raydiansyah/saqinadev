"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { updateMilestone } from "@/lib/tasks/service";

export async function updateMilestoneAction(slug: string, input: unknown) {
  return runAction("milestone.update", { slug }, async () => {
    await updateMilestone(await requireActor(), slug, input);
    revalidatePath("/[locale]/project/[slug]", "layout");
  });
}
