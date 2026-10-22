"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { answerDeliveryCheck } from "@/lib/delivery/service";

/** The team answers one of the build, review and deploy questions. */
export async function answerDeliveryAction(slug: string, step: string, done: boolean) {
  return runAction("delivery.answer", { slug, step }, async () => {
    await answerDeliveryCheck(await requireActor(), slug, { step, done });
    revalidatePath("/[locale]/project/[slug]", "layout");
  });
}
