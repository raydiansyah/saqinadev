"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { clientCreateRequest } from "@/lib/engagement/requests";

export async function createRequestAction(slug: string, input: unknown) {
  return runAction("portal.request.create", { slug }, async () => {
    const result = await clientCreateRequest(await requireActor(), String(slug), input);
    revalidatePath("/[locale]/portal/projects/[slug]", "layout");
    return result;
  });
}
