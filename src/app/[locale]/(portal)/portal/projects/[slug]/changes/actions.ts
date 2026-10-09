"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { clientDecideChangeRequest } from "@/lib/change-requests/service";

export async function decideChangeRequestAction(slug: string, id: string, input: unknown) {
  return runAction("portal.changeRequest.decide", { slug, id }, async () => {
    await clientDecideChangeRequest(await requireActor(), String(slug), String(id), input);
    revalidatePath("/[locale]/portal/projects/[slug]", "layout");
  });
}
