import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { paymentTerms, projects } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";
import { resolveTermAmounts } from "./rules";
import { type ScheduleInput, scheduleInput } from "./schedule-input";

export { type ScheduleInput, scheduleInput };

/**
 * Sets the project value and its payment schedule. Terms that are already invoiced stay as
 * they are; the new terms replace the rest and everything together must equal the value.
 */
export async function setPaymentScheduleTx(
  tx: Tx,
  access: Pick<ProjectAccess, "actor" | "project">,
  data: ScheduleInput,
  metadata: Record<string, string> = {},
) {
  const { project, actor } = access;
  const current = await listTerms(project.id, tx);
  const invoiced = current.filter((t) => t.invoiceId !== null);
  const lockedTotal = invoiced.reduce((a, t) => a + t.amount, 0);

  // Invoiced terms are kept; the new terms must cover the rest of the value.
  const amounts = resolveTermAmounts(data.value, data.terms, data.value - lockedTotal);
  const fits =
    data.terms.length > 0 ? amounts !== null : lockedTotal === 0 || lockedTotal === data.value;
  if (!amounts || !fits)
    throw new AppError("VALIDATION_ERROR", "Terms must add up to the project value", {
      terms: "billing.termsMismatch",
    });

  await tx
    .delete(paymentTerms)
    .where(and(eq(paymentTerms.projectId, project.id), isNull(paymentTerms.invoiceId)));
  if (data.terms.length > 0)
    await tx.insert(paymentTerms).values(
      data.terms.map((t, i) => ({
        projectId: project.id,
        label: t.label,
        percentBp: t.percentBp ?? null,
        amount: amounts[i],
        dueDate: t.dueDate ?? null,
        position: invoiced.length + i,
      })),
    );
  await tx.update(projects).set({ value: data.value }).where(eq(projects.id, project.id));
  await recordActivity(tx, {
    projectId: project.id,
    actorId: actor.id,
    type: "billing.schedule_updated",
    entityType: "project",
    entityId: project.id,
    metadata: { value: data.value, terms: data.terms.length + invoiced.length, ...metadata },
  });
}

export async function setPaymentSchedule(actor: Actor, slug: string, input: unknown) {
  const data = parse(scheduleInput, input);
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "billing:write", tx);
    await setPaymentScheduleTx(tx, access, data);
  });
}

export async function listTerms(projectId: string, executor: Tx | typeof db = db) {
  return executor
    .select()
    .from(paymentTerms)
    .where(eq(paymentTerms.projectId, projectId))
    .orderBy(asc(paymentTerms.position));
}
