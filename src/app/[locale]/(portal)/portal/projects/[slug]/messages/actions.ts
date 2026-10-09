"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { clientPostMessage } from "@/lib/engagement/messages";

export async function postMessageAction(slug: string, input: unknown) {
  return runAction("portal.message.post", { slug }, async () => {
    await clientPostMessage(await requireActor(), String(slug), input);
    revalidatePath("/[locale]/portal/projects/[slug]/messages", "page");
  });
}
