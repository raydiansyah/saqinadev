"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { answerDeliveryCheck } from "@/lib/delivery/service";

/** The team answers one of the build, review and deploy questions. */
export async function answerDeliveryAction(
  slug: string,
  step: string,
  done: boolean,
  adjustTasks = false,
) {
  return runAction("delivery.answer", { slug, step }, async () => {
    const moved = await answerDeliveryCheck(await requireActor(), slug, {
      step,
      done,
      adjustTasks,
    });
    revalidatePath("/[locale]/project/[slug]", "layout");
    return moved;
  });
}
