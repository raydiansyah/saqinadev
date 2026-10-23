import "server-only";
import { and, count, eq, inArray, max, ne } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { deliveryChecks, milestones, tasks, users } from "@/lib/db/schema";
import { DELIVERY_STEPS, type DeliveryStep } from "@/lib/domain/delivery";
import { parse } from "@/lib/validation";
import {
  type Answers,
  type DeliveryNote,
  deliveryNotes,
  NO_ANSWERS,
  settleAnswers,
  type TaskAdjustment,
  type TaskCounts,
} from "./consistency";
import { loadDeliverySummaries } from "./summary";

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
  /** Imported from GitHub and still waiting for the first answers. */
  awaiting: boolean;
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
  const summary = (await loadDeliverySummaries(db, [access.project.id])).get(access.project.id);
  return {
    checks,
    tasks: counts,
    notes: deliveryNotes(checks, counts),
    awaiting: summary?.awaiting ?? false,
  };
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

const answerInput = z.object({
  step: z.enum(DELIVERY_STEPS),
  done: z.boolean(),
  /** Also move the tasks to match: open ones to review when built, all to done when reviewed. */
  adjustTasks: z.boolean().default(false),
});

/**
 * Records the team's answer and what it implies (deployed means reviewed and built; not built
 * means not reviewed and not deployed). With `adjustTasks` the plan follows the answers, forward
 * only. Answering again, even with the same answer, confirms it is current.
 */
export async function answerDeliveryCheck(actor: Actor, slug: string, raw: unknown) {
  const { step, done, adjustTasks } = parse(answerInput, raw);
  return db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const at = new Date();

    const rows = await tx
      .select({ step: deliveryChecks.step, done: deliveryChecks.done })
      .from(deliveryChecks)
      .where(eq(deliveryChecks.projectId, project.id))
      .for("update");
    const before: Answers = { ...NO_ANSWERS };
    for (const r of rows) before[r.step] = r.done;
    const after = settleAnswers(before, step, done);

    // The answer itself, and any earlier or later step it settles.
    const changed = DELIVERY_STEPS.filter((s) => s === step || after[s] !== before[s]);
    for (const s of changed) {
      const value = after[s] ?? false;
      await tx
        .insert(deliveryChecks)
        .values({
          projectId: project.id,
          step: s,
          done: value,
          answeredBy: actor.id,
          answeredAt: at,
        })
        .onConflictDoUpdate({
          target: [deliveryChecks.projectId, deliveryChecks.step],
          set: { done: value, answeredBy: actor.id, answeredAt: at },
        });
    }

    let moved: TaskAdjustment = { toReview: 0, toDone: 0 };
    if (adjustTasks) {
      moved = await adjustTasksTo(tx, project.id, after, at);
      if (moved.toReview + moved.toDone > 0) {
        // The plan now matches every answer, so none of them is out of date because of this move.
        await tx
          .update(deliveryChecks)
          .set({ answeredAt: at })
          .where(eq(deliveryChecks.projectId, project.id));
        await recordActivity(tx, {
          projectId: project.id,
          actorId: actor.id,
          type: "task.updated",
          entityType: "task",
          metadata: { count: moved.toReview + moved.toDone, origin: "delivery" },
        });
      }
    }
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: project.id,
      type: "delivery.answered",
      entityType: "project",
      entityId: project.id,
      metadata: {
        step,
        done,
        implied: changed.filter((s) => s !== step).join(",") || null,
        toReview: moved.toReview,
        toDone: moved.toDone,
      },
    });
    return moved;
  });
}

/** Moves tasks forward to match the answers. The same time stamps the tasks and the answers. */
async function adjustTasksTo(
  tx: Tx,
  projectId: string,
  answers: Answers,
  at: Date,
): Promise<TaskAdjustment> {
  if (answers.review === true) {
    const rows = await tx
      .update(tasks)
      .set({ status: "done", completedAt: at, updatedAt: at })
      .where(and(eq(tasks.projectId, projectId), ne(tasks.status, "done")))
      .returning({ id: tasks.id });
    return { toReview: 0, toDone: rows.length };
  }
  if (answers.build === true) {
    const rows = await tx
      .update(tasks)
      .set({ status: "review", updatedAt: at })
      .where(
        and(
          eq(tasks.projectId, projectId),
          inArray(tasks.status, ["backlog", "todo", "in_progress", "blocked"]),
        ),
      )
      .returning({ id: tasks.id });
    return { toReview: rows.length, toDone: 0 };
  }
  return { toReview: 0, toDone: 0 };
}
