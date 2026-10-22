import "server-only";
import { count, eq, max } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { deliveryChecks, milestones, tasks, users } from "@/lib/db/schema";
import { DELIVERY_STEPS, type DeliveryStep } from "@/lib/domain/delivery";
import { parse } from "@/lib/validation";
import { type DeliveryNote, deliveryNotes, type TaskCounts } from "./consistency";

export interface DeliveryCheckView {
  step: DeliveryStep;
  /** Nobody has answered this question yet. */
  unanswered: boolean;
  done: boolean;
  answeredBy: string | null;
  answeredAt: Date | null;
  /** Tasks or milestones changed after the answer, so it needs confirming again. */
  stale: boolean;
}

export interface DeliveryOverview {
  checks: DeliveryCheckView[];
  /** The plan as the tasks say it is, and where the answers disagree with it. */
  tasks: TaskCounts;
  notes: DeliveryNote[];
}

/** The three questions with their latest answers, in order, checked against the tasks. */
export async function getDeliveryOverview(access: ProjectAccess): Promise<DeliveryOverview> {
  const checks = await getDeliveryChecks(access);
  const byStatus = await db
    .select({ status: tasks.status, n: count() })
    .from(tasks)
    .where(eq(tasks.projectId, access.project.id))
    .groupBy(tasks.status);
  const n = (s: string) => byStatus.find((r) => r.status === s)?.n ?? 0;
  const total = byStatus.reduce((a, r) => a + r.n, 0);
  const counts: TaskCounts = {
    total,
    done: n("done"),
    review: n("review"),
    open: total - n("done") - n("review"),
  };
  return { checks, tasks: counts, notes: deliveryNotes(checks, counts) };
}

/** The three questions with their latest answers, in order. */
export async function getDeliveryChecks(access: ProjectAccess): Promise<DeliveryCheckView[]> {
  const projectId = access.project.id;
  const [rows, [taskChange], [milestoneChange]] = await Promise.all([
    db
      .select({
        step: deliveryChecks.step,
        done: deliveryChecks.done,
        at: deliveryChecks.answeredAt,
        by: users.name,
      })
      .from(deliveryChecks)
      .leftJoin(users, eq(users.id, deliveryChecks.answeredBy))
      .where(eq(deliveryChecks.projectId, projectId)),
    db
      .select({ at: max(tasks.updatedAt) })
      .from(tasks)
      .where(eq(tasks.projectId, projectId)),
    db
      .select({ at: max(milestones.updatedAt) })
      .from(milestones)
      .where(eq(milestones.projectId, projectId)),
  ]);
  const changedAt = Math.max(taskChange?.at?.getTime() ?? 0, milestoneChange?.at?.getTime() ?? 0);
  return DELIVERY_STEPS.map((step) => {
    const row = rows.find((r) => r.step === step);
    return {
      step,
      unanswered: !row,
      done: row?.done ?? false,
      answeredBy: row?.by ?? null,
      answeredAt: row?.at ?? null,
      stale: row ? changedAt > row.at.getTime() : false,
    };
  });
}

const answerInput = z.object({ step: z.enum(DELIVERY_STEPS), done: z.boolean() });

/** Records the team's answer. Answering again, even with the same answer, confirms it is current. */
export async function answerDeliveryCheck(actor: Actor, slug: string, raw: unknown) {
  const { step, done } = parse(answerInput, raw);
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const values = {
      projectId: project.id,
      step,
      done,
      answeredBy: actor.id,
      answeredAt: new Date(),
    };
    await tx
      .insert(deliveryChecks)
      .values(values)
      .onConflictDoUpdate({
        target: [deliveryChecks.projectId, deliveryChecks.step],
        set: { done, answeredBy: actor.id, answeredAt: values.answeredAt },
      });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: project.id,
      type: "delivery.answered",
      entityType: "project",
      entityId: project.id,
      metadata: { step, done },
    });
  });
}
