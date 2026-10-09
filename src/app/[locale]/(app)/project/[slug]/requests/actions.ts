"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { createChangeRequest } from "@/lib/change-requests/service";
import { teamCreateRequest, updateRequest } from "@/lib/engagement/requests";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function logRequestAction(slug: string, input: unknown) {
  return runAction("request.create", { slug }, async () => {
    const result = await teamCreateRequest(await requireActor(), slug, input);
    refresh();
    return result;
  });
}

export async function updateRequestAction(slug: string, id: string, input: unknown) {
  return runAction("request.update", { slug, id }, async () => {
    await updateRequest(await requireActor(), slug, id, input);
    refresh();
  });
}

/** Turns a request into a draft change request; the request is marked converted. */
export async function convertRequestAction(
  slug: string,
  input: { requestId: string; title: string; description: string },
) {
  return runAction("request.convert", { slug, id: input.requestId }, async () => {
    const result = await createChangeRequest(await requireActor(), slug, input);
    refresh();
    return result;
  });
}
