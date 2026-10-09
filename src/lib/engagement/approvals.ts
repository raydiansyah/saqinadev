import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { clientApprovals, documents } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { clientRecipients, deliver, notifyTx, teamRecipients } from "@/lib/notifications/service";
import { parse } from "@/lib/validation";
import { clientParty, portalHref, teamHref } from "./shared";

export type ClientApproval = typeof clientApprovals.$inferSelect;

const createInput = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).default(""),
  /** Optional: an approved document the client should review (shared automatically). */
  docSlug: z.string().trim().max(64).optional(),
  link: z.union([z.literal(""), z.url().max(500)]).default(""),
});

/** The team asks the client to approve something. Nothing changes until the client answers. */
export async function requestApproval(actor: Actor, slug: string, input: unknown) {
  const data = parse(createInput, input);
  const { id, pending } = await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    if (!project.clientId || !project.portalEnabled)
      throw new AppError("CONFLICT", "The client portal is off", {
        portal: "engagement.portalOff",
      });
    let documentId: string | null = null;
    if (data.docSlug) {
      const [doc] = await tx
        .select({ id: documents.id, status: documents.status })
        .from(documents)
        .where(and(eq(documents.projectId, project.id), eq(documents.slug, data.docSlug)));
      if (!doc) throw new AppError("NOT_FOUND");
      // The client can only open approved documents, so the reviewed one is shared with them.
      if (doc.status !== "approved" && doc.status !== "signed")
        throw new AppError("VALIDATION_ERROR", "Approve the document first", {
          docSlug: "documents.shareNeedsApproval",
        });
      await tx.update(documents).set({ clientVisible: true }).where(eq(documents.id, doc.id));
      documentId = doc.id;
    }
    const [row] = await tx
      .insert(clientApprovals)
      .values({
        projectId: project.id,
        title: data.title,
        description: data.description,
        documentId,
        link: data.link || null,
        requestedBy: actor.id,
      })
      .returning({ id: clientApprovals.id });
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "approval.requested",
      entityType: "client_approval",
      entityId: row.id,
      metadata: { title: data.title },
    });
    const pending = await notifyTx(tx, {
      userIds: await clientRecipients(tx, project.id),
      projectId: project.id,
      type: "approval.requested",
      params: { title: data.title, project: project.name },
      href: portalHref(project.slug, "/approvals"),
      dedupKey: `approval:${row.id}`,
      email: true,
    });
    return { id: row.id, pending };
  });
  await deliver(pending);
  return { id };
}

export async function cancelApproval(actor: Actor, slug: string, id: string) {
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const [row] = await tx
      .update(clientApprovals)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(clientApprovals.id, id),
          eq(clientApprovals.projectId, project.id),
          eq(clientApprovals.status, "pending"),
        ),
      )
      .returning({ id: clientApprovals.id });
    if (!row) throw new AppError("NOT_FOUND");
  });
}

const respondInput = z.object({
  decision: z.enum(["approved", "changes_requested"]),
  note: z.string().trim().max(2000).default(""),
});

/** The client's answer. Requesting changes needs a note so the team knows what to change. */
export async function clientRespondApproval(
  actor: Actor,
  slug: string,
  id: string,
  input: unknown,
) {
  const data = parse(respondInput, input);
  if (data.decision === "changes_requested" && data.note.length < 3)
    throw new AppError("VALIDATION_ERROR", "Say what should change", {
      note: "engagement.noteRequired",
    });
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND");
  const party = await clientParty(actor, slug);
  const pending = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(clientApprovals)
      .set({
        status: data.decision,
        respondedBy: actor.id,
        respondedAt: new Date(),
        responseNote: data.note || null,
      })
      .where(
        and(
          eq(clientApprovals.id, id),
          eq(clientApprovals.projectId, party.project.id),
          eq(clientApprovals.status, "pending"),
        ),
      )
      .returning();
    if (!row) throw new AppError("NOT_FOUND");
    await recordActivity(tx, {
      projectId: party.project.id,
      actorId: actor.id,
      type: "approval.responded",
      entityType: "client_approval",
      entityId: id,
      metadata: { title: row.title, decision: data.decision },
    });
    return notifyTx(tx, {
      userIds: await teamRecipients(tx, party.project.id),
      projectId: party.project.id,
      type: `approval.${data.decision}`,
      params: { title: row.title, project: party.project.name },
      href: teamHref(party.project.slug, "/client-approvals"),
      dedupKey: `approval:${id}:${data.decision}`,
      email: true,
    });
  });
  await deliver(pending);
}

export async function listApprovals(projectId: string): Promise<ClientApproval[]> {
  return db
    .select()
    .from(clientApprovals)
    .where(eq(clientApprovals.projectId, projectId))
    .orderBy(desc(clientApprovals.createdAt));
}
