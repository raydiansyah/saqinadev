"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { startBuilding } from "@/lib/studio/kickoff";

/** "Start building": hands open tasks to the team agents when Saqina builds the project. */
export async function startBuildingAction(slug: string) {
  return runAction("studio.start", { slug }, async () => {
    const result = await startBuilding(await requireActor(), slug);
    revalidatePath("/[locale]/project/[slug]", "layout");
    return result;
  });
}
