"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { cancelApproval, requestApproval } from "@/lib/engagement/approvals";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function requestApprovalAction(slug: string, input: unknown) {
  return runAction("approval.request", { slug }, async () => {
    const result = await requestApproval(await requireActor(), slug, input);
    refresh();
    return result;
  });
}

export async function cancelApprovalAction(slug: string, id: string) {
  return runAction("approval.cancel", { slug, id }, async () => {
    await cancelApproval(await requireActor(), slug, id);
    refresh();
  });
}
