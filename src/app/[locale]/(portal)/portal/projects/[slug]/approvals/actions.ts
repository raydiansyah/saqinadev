"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { clientRespondApproval } from "@/lib/engagement/approvals";

export async function respondApprovalAction(slug: string, id: string, input: unknown) {
  return runAction("portal.approval.respond", { slug, id }, async () => {
    await clientRespondApproval(await requireActor(), String(slug), String(id), input);
    revalidatePath("/[locale]/portal/projects/[slug]", "layout");
  });
}
