import "server-only";
import { and, desc, eq, max } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { decisions, projects } from "@/lib/db/schema";
import { DECISION_STATUSES } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";

export type DecisionView = typeof decisions.$inferSelect;

export async function listDecisions(access: ProjectAccess): Promise<DecisionView[]> {
  return db
    .select()
    .from(decisions)
    .where(eq(decisions.projectId, access.project.id))
    .orderBy(desc(decisions.number));
}

const createInput = z
  .object({
    question: z.string().trim().min(5).max(300),
    context: z.string().trim().max(2000).default(""),
    options: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
    selected: z.string().trim().min(1).max(160),
    reason: z.string().trim().min(3).max(2000),
  })
  .refine((d) => d.options.includes(d.selected), { path: ["selected"], message: "notAnOption" });

/** Decisions record why something was chosen; numbers are sequential per project. */
export async function createDecision(
  actor: Actor,
  slug: string,
  input: unknown,
): Promise<DecisionView> {
  const data = parse(createInput, input);
  return db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    // Lock the project row so two concurrent decisions cannot take the same number.
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, project.id))
      .for("update");
    const [{ last }] = await tx
      .select({ last: max(decisions.number) })
      .from(decisions)
      .where(eq(decisions.projectId, project.id));
    const [row] = await tx
      .insert(decisions)
      .values({
        projectId: project.id,
        number: (last ?? 0) + 1,
        ...data,
        status: "accepted",
        createdBy: actor.id,
      })
      .returning();
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "decision.created",
      entityType: "decision",
      entityId: row.id,
      metadata: { number: row.number, selected: row.selected },
    });
    return row;
  });
}

export async function setDecisionStatus(actor: Actor, slug: string, input: unknown) {
  const { id, status } = parse(
    z.object({ id: z.uuid(), status: z.enum(DECISION_STATUSES) }),
    input,
  );
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [row] = await tx
      .update(decisions)
      .set({ status })
      .where(and(eq(decisions.id, id), eq(decisions.projectId, project.id)))
      .returning({ number: decisions.number });
    if (!row) throw new AppError("NOT_FOUND");
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "decision.updated",
      entityType: "decision",
      entityId: id,
      metadata: { number: row.number, status },
    });
  });
}
