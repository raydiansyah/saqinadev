"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { teamPostMessage } from "@/lib/engagement/messages";

export async function postMessageAction(slug: string, input: unknown) {
  return runAction("message.post", { slug }, async () => {
    await teamPostMessage(await requireActor(), slug, input);
    revalidatePath("/[locale]/project/[slug]/messages", "page");
  });
}
