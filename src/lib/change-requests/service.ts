import "server-only";
import { and, desc, eq, max, sql } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { changeRequests, clientRequests, paymentTerms, projects } from "@/lib/db/schema";
import {
  asAccess,
  clientParty,
  type Party,
  portalHref,
  teamHref,
  teamParty,
} from "@/lib/engagement/shared";
import { AppError } from "@/lib/errors";
import { clientRecipients, deliver, notifyTx, teamRecipients } from "@/lib/notifications/service";
import { checkScope } from "@/lib/scope/check";
import { createScopeItemTx, listScope } from "@/lib/scope/service";
import { createTaskTx } from "@/lib/tasks/service";
import { parse } from "@/lib/validation";

/**
 * Change requests: work outside the agreed scope. A CR only becomes scope, a task and money
 * after the client approves it (on the portal, or recorded by the team with the evidence).
 */

export type ChangeRequest = typeof changeRequests.$inferSelect;

export const crNumber = (n: number) => `CR-${String(n).padStart(3, "0")}`;

export const changeRequestInput = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(4000).default(""),
  impact: z.string().trim().max(2000).default(""),
  /** Minor units of the project currency. */
  additionalCost: z.number().int().min(0).max(9_000_000_000_000).default(0),
  additionalDays: z.number().int().min(0).max(3650).default(0),
  requestId: z.uuid().optional(),
});
export type ChangeRequestInput = z.output<typeof changeRequestInput>;

export async function createChangeRequestTx(
  tx: Tx,
  party: Party,
  data: ChangeRequestInput,
): Promise<ChangeRequest> {
  const { project } = party;
  const [{ top }] = await tx
    .select({ top: max(changeRequests.number) })
    .from(changeRequests)
    .where(eq(changeRequests.projectId, project.id));
  const verdict = checkScope(data.title, await listScope(project.id, tx));
  const [row] = await tx
    .insert(changeRequests)
    .values({
      ...data,
      projectId: project.id,
      number: (top ?? 0) + 1,
      currency: project.currency,
      scopeStatus:
        verdict.status === "unknown"
          ? "unknown"
          : verdict.status === "included"
            ? "within"
            : "out_of_scope",
      createdBy: party.actor.id,
    })
    .returning();
  if (data.requestId)
    await tx
      .update(clientRequests)
      .set({ status: "converted", changeRequestId: row.id })
      .where(and(eq(clientRequests.id, data.requestId), eq(clientRequests.projectId, project.id)));
  await recordActivity(tx, {
    projectId: project.id,
    actorId: party.actor.id,
    type: "change_request.created",
    entityType: "change_request",
    entityId: row.id,
    metadata: { number: crNumber(row.number), title: row.title },
  });
  return row;
}

export async function createChangeRequest(actor: Actor, slug: string, input: unknown) {
  const data = parse(changeRequestInput, input);
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const row = await createChangeRequestTx(tx, teamParty(access), data);
    return { id: row.id, number: crNumber(row.number) };
  });
}

async function lockCr(tx: Tx, projectId: string, id: string): Promise<ChangeRequest> {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND");
  const [row] = await tx
    .select()
    .from(changeRequests)
    .where(and(eq(changeRequests.id, id), eq(changeRequests.projectId, projectId)))
    .for("update");
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/** Drafts are editable; once sent the client is looking at it, so it is fixed. */
export async function updateChangeRequest(actor: Actor, slug: string, id: string, input: unknown) {
  const data = parse(changeRequestInput.omit({ requestId: true }), input);
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const cr = await lockCr(tx, project.id, id);
    if (cr.status !== "draft")
      throw new AppError("CONFLICT", "Only drafts can be edited", { status: "cr.notDraft" });
    await tx.update(changeRequests).set(data).where(eq(changeRequests.id, id));
  });
}

/** Sends the CR (with its cost and time) to the client portal for a decision. */
export async function sendChangeRequest(actor: Actor, slug: string, id: string) {
  const pending = await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    if (!project.clientId || !project.portalEnabled)
      throw new AppError("CONFLICT", "The client portal is off", {
        portal: "engagement.portalOff",
      });
    const cr = await lockCr(tx, project.id, id);
    if (cr.status !== "draft")
      throw new AppError("CONFLICT", "Already sent", { status: "cr.notDraft" });
    await tx
      .update(changeRequests)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(changeRequests.id, id));
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "change_request.sent",
      entityType: "change_request",
      entityId: id,
      metadata: { number: crNumber(cr.number) },
    });
    return notifyTx(tx, {
      userIds: await clientRecipients(tx, project.id),
      projectId: project.id,
      type: "change_request.sent",
      params: { number: crNumber(cr.number), title: cr.title, project: project.name },
      href: portalHref(project.slug, "/changes"),
      dedupKey: `cr:${id}:sent`,
      email: true,
    });
  });
  await deliver(pending);
}

/**
 * Approval side effects, all in one transaction: the change joins the scope, a task is
 * created, and a cost becomes a payment term that raises the project value.
 */
async function applyApproval(tx: Tx, party: Party, cr: ChangeRequest) {
  const access = asAccess(party);
  const label = crNumber(cr.number);
  await createScopeItemTx(
    tx,
    access,
    { title: cr.title, description: cr.description, category: "included", clientVisible: true },
    { source: label },
  );
  await createTaskTx(tx, access, {
    title: `${label}: ${cr.title}`,
    description: [cr.description, cr.impact].filter(Boolean).join("\n\n"),
    priority: "medium",
    status: "todo",
    milestoneId: null,
  });
  if (cr.additionalCost > 0) {
    const [{ top }] = await tx
      .select({ top: max(paymentTerms.position) })
      .from(paymentTerms)
      .where(eq(paymentTerms.projectId, cr.projectId));
    await tx.insert(paymentTerms).values({
      projectId: cr.projectId,
      label,
      percentBp: null,
      amount: cr.additionalCost,
      position: (top ?? -1) + 1,
    });
    await tx
      .update(projects)
      .set({ value: sql`coalesce(${projects.value}, 0) + ${cr.additionalCost}` })
      .where(eq(projects.id, cr.projectId));
    await recordActivity(tx, {
      projectId: cr.projectId,
      actorId: party.actor.id,
      type: "billing.schedule_updated",
      entityType: "change_request",
      entityId: cr.id,
      metadata: { added: cr.additionalCost, source: label },
    });
  }
}

const decisionInput = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(2000).default(""),
});

async function decide(party: Party, id: string, input: unknown) {
  const data = parse(decisionInput, input);
  // The team may record a decision the client gave elsewhere, but must say where.
  if (party.side === "team" && data.note.length < 5)
    throw new AppError("VALIDATION_ERROR", "Record how the client decided", {
      note: "cr.evidenceRequired",
    });
  const pending = await db.transaction(async (tx) => {
    const cr = await lockCr(tx, party.project.id, id);
    if (cr.status !== "sent")
      throw new AppError("CONFLICT", "Not waiting for a decision", { status: "cr.notSent" });
    await tx
      .update(changeRequests)
      .set({
        status: data.decision,
        decidedBy: party.actor.id,
        decidedAt: new Date(),
        decisionNote: data.note || null,
      })
      .where(eq(changeRequests.id, id));
    if (data.decision === "approved") await applyApproval(tx, party, cr);
    await recordActivity(tx, {
      projectId: party.project.id,
      actorId: party.actor.id,
      type: "change_request.decided",
      entityType: "change_request",
      entityId: id,
      metadata: { number: crNumber(cr.number), decision: data.decision, side: party.side },
    });
    return notifyTx(tx, {
      userIds:
        party.side === "client"
          ? await teamRecipients(tx, party.project.id)
          : await clientRecipients(tx, party.project.id),
      projectId: party.project.id,
      type: `change_request.${data.decision}`,
      params: { number: crNumber(cr.number), title: cr.title, project: party.project.name },
      href:
        party.side === "client"
          ? teamHref(party.project.slug, "/changes")
          : portalHref(party.project.slug, "/changes"),
      dedupKey: `cr:${id}:${data.decision}`,
      email: true,
    });
  });
  await deliver(pending);
}

export async function clientDecideChangeRequest(
  actor: Actor,
  slug: string,
  id: string,
  input: unknown,
) {
  return decide(await clientParty(actor, slug), id, input);
}

/** Records a decision the client gave outside the portal (email, meeting). Note required. */
export async function teamRecordDecision(actor: Actor, slug: string, id: string, input: unknown) {
  const access = await loadProjectAccess(actor, { slug }, "billing:write");
  return decide(teamParty(access), id, input);
}

export async function setChangeRequestStatus(
  actor: Actor,
  slug: string,
  id: string,
  status: "cancelled" | "done",
) {
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const cr = await lockCr(tx, project.id, id);
    const allowed = status === "cancelled" ? ["draft", "sent"] : ["approved"];
    if (!allowed.includes(cr.status))
      throw new AppError("CONFLICT", "Invalid transition", { status: "cr.invalidTransition" });
    await tx.update(changeRequests).set({ status }).where(eq(changeRequests.id, id));
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "change_request.updated",
      entityType: "change_request",
      entityId: id,
      metadata: { number: crNumber(cr.number), status },
    });
  });
}

export async function listChangeRequests(projectId: string): Promise<ChangeRequest[]> {
  return db
    .select()
    .from(changeRequests)
    .where(eq(changeRequests.projectId, projectId))
    .orderBy(desc(changeRequests.number));
}
