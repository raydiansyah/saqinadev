"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { runAction } from "@/lib/actions";
import { recordActivity } from "@/lib/activity/service";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { requireActor } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { milestones } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";

const milestoneClientInput = z.object({
  id: z.uuid(),
  clientTitle: z.string().trim().max(120),
  clientVisible: z.boolean(),
});

/** Sets how a milestone appears on the client portal (visibility and a plainer name). */
export async function updateMilestoneClientAction(slug: string, input: unknown) {
  return runAction("milestone.client", { slug }, async () => {
    const data = parse(milestoneClientInput, input);
    const actor = await requireActor();
    await db.transaction(async (tx) => {
      const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
      const [row] = await tx
        .update(milestones)
        .set({ clientVisible: data.clientVisible, clientTitle: data.clientTitle || null })
        .where(and(eq(milestones.id, data.id), eq(milestones.projectId, project.id)))
        .returning({ id: milestones.id });
      if (!row) throw new AppError("NOT_FOUND");
      await recordActivity(tx, {
        projectId: project.id,
        actorId: actor.id,
        type: "milestone.updated",
        entityType: "milestone",
        entityId: row.id,
        metadata: { clientVisible: data.clientVisible },
      });
    });
    revalidatePath("/[locale]/project/[slug]", "layout");
  });
}
