import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { maintenancePlans, projects } from "@/lib/db/schema";
import { MAINTENANCE_CYCLES, MAINTENANCE_STATUSES } from "@/lib/domain/business";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";
import { renewalPeriod } from "./classify";

export type MaintenancePlan = typeof maintenancePlans.$inferSelect;

const planInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    /** Minor units of the project currency, per cycle. */
    fee: z.number().int().min(0),
    cycle: z.enum(MAINTENANCE_CYCLES),
    scope: z.string().trim().max(4000).default(""),
    excluded: z.string().trim().max(4000).default(""),
    responseHours: z.number().int().min(1).max(720).nullable().default(null),
  })
  .refine((p) => p.endDate >= p.startDate, { path: ["endDate"], message: "endBeforeStart" });

async function log(tx: Tx, actor: Actor, projectId: string, entityId: string, change: string) {
  await recordActivity(tx, {
    projectId,
    actorId: actor.id,
    type: "maintenance.plan_updated",
    entityType: "maintenance_plan",
    entityId,
    metadata: { change },
  });
}

export async function createPlan(actor: Actor, slug: string, input: unknown) {
  const data = parse(planInput, input);
  return db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "billing:write", tx);
    const [row] = await tx
      .insert(maintenancePlans)
      .values({ ...data, projectId: project.id, currency: project.currency, createdBy: actor.id })
      .returning({ id: maintenancePlans.id });
    await log(tx, actor, project.id, row.id, "created");
    return row;
  });
}

async function lockPlan(tx: Tx, projectId: string, id: string): Promise<MaintenancePlan> {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND");
  const [row] = await tx
    .select()
    .from(maintenancePlans)
    .where(and(eq(maintenancePlans.id, id), eq(maintenancePlans.projectId, projectId)))
    .for("update");
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

export async function updatePlan(actor: Actor, slug: string, id: string, input: unknown) {
  const data = parse(planInput.and(z.object({ status: z.enum(MAINTENANCE_STATUSES) })), input);
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "billing:write", tx);
    await lockPlan(tx, project.id, id);
    await tx.update(maintenancePlans).set(data).where(eq(maintenancePlans.id, id));
    await log(tx, actor, project.id, id, "updated");
  });
}

/** A new plan for the next period with the same terms; the old one is marked ended. */
export async function renewPlan(actor: Actor, slug: string, id: string) {
  return db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "billing:write", tx);
    const old = await lockPlan(tx, project.id, id);
    if (old.status === "cancelled")
      throw new AppError("CONFLICT", "Cancelled plans are not renewed", {
        status: "maintenance.cancelled",
      });
    const period = renewalPeriod(old.startDate, old.endDate);
    const [row] = await tx
      .insert(maintenancePlans)
      .values({
        projectId: project.id,
        name: old.name,
        startDate: period.start,
        endDate: period.end,
        fee: old.fee,
        currency: old.currency,
        cycle: old.cycle,
        scope: old.scope,
        excluded: old.excluded,
        responseHours: old.responseHours,
        renewedFromId: old.id,
        createdBy: actor.id,
      })
      .returning({ id: maintenancePlans.id });
    await tx.update(maintenancePlans).set({ status: "ended" }).where(eq(maintenancePlans.id, id));
    await log(tx, actor, project.id, row.id, "renewed");
    return row;
  });
}

export async function setWarranty(actor: Actor, slug: string, input: unknown) {
  const { warrantyUntil } = parse(z.object({ warrantyUntil: z.iso.date().nullable() }), input);
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    await tx.update(projects).set({ warrantyUntil }).where(eq(projects.id, project.id));
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "maintenance.plan_updated",
      entityType: "project",
      entityId: project.id,
      metadata: { warrantyUntil },
    });
  });
}

export async function listPlans(projectId: string): Promise<MaintenancePlan[]> {
  return db
    .select()
    .from(maintenancePlans)
    .where(eq(maintenancePlans.projectId, projectId))
    .orderBy(desc(maintenancePlans.endDate));
}
