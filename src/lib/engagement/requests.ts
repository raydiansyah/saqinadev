import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { todayIso } from "@/lib/billing/rules";
import { db, type Tx } from "@/lib/db/client";
import { clientRequests, maintenancePlans } from "@/lib/db/schema";
import { MAINTENANCE_CLASSES, REQUEST_KINDS, REQUEST_STATUSES } from "@/lib/domain/business";
import { AppError } from "@/lib/errors";
import { suggestClassification } from "@/lib/maintenance/classify";
import { clientRecipients, deliver, notifyTx, teamRecipients } from "@/lib/notifications/service";
import { checkScope } from "@/lib/scope/check";
import { listScope } from "@/lib/scope/service";
import { parse } from "@/lib/validation";
import { clientParty, type Party, portalHref, teamHref, teamParty } from "./shared";

export type ClientRequest = typeof clientRequests.$inferSelect;

const requestInput = z.object({
  kind: z.enum(REQUEST_KINDS),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().max(4000).default(""),
});

/** Scope check and (for maintenance and bugs) a who-pays suggestion, both from records. */
async function assess(tx: Tx, party: Party, data: z.output<typeof requestInput>) {
  const scope = await listScope(party.project.id, tx);
  const verdict = checkScope(`${data.title} ${data.body}`, scope);
  const scopeStatus =
    verdict.status === "unknown"
      ? ("unknown" as const)
      : verdict.status === "included"
        ? ("within" as const)
        : ("out_of_scope" as const);
  if (data.kind !== "maintenance" && data.kind !== "bug") return { scopeStatus, suggested: null };
  const plans = await tx
    .select({
      startDate: maintenancePlans.startDate,
      endDate: maintenancePlans.endDate,
      status: maintenancePlans.status,
    })
    .from(maintenancePlans)
    .where(eq(maintenancePlans.projectId, party.project.id));
  const suggested = suggestClassification({
    kind: data.kind,
    date: todayIso(),
    warrantyUntil: party.project.warrantyUntil,
    plans,
  });
  return { scopeStatus, suggested };
}

async function createRequest(party: Party, input: unknown) {
  const data = parse(requestInput, input);
  const { id, pending } = await db.transaction(async (tx) => {
    const { scopeStatus, suggested } = await assess(tx, party, data);
    const [row] = await tx
      .insert(clientRequests)
      .values({
        ...data,
        projectId: party.project.id,
        clientId: party.clientId,
        authorId: party.actor.id,
        side: party.side,
        scopeStatus,
        suggestedClassification: suggested,
      })
      .returning({ id: clientRequests.id });
    await recordActivity(tx, {
      projectId: party.project.id,
      actorId: party.actor.id,
      type: "request.created",
      entityType: "client_request",
      entityId: row.id,
      metadata: { kind: data.kind, side: party.side },
    });
    const pending =
      party.side === "client"
        ? await notifyTx(tx, {
            userIds: await teamRecipients(tx, party.project.id),
            projectId: party.project.id,
            type: "request.created",
            params: { title: data.title, project: party.project.name },
            href: teamHref(party.project.slug, "/requests"),
            dedupKey: `request:${row.id}`,
          })
        : null;
    return { id: row.id, pending };
  });
  if (pending) await deliver(pending);
  return { id };
}

/** Submitted on the client portal. */
export async function clientCreateRequest(actor: Actor, slug: string, input: unknown) {
  return createRequest(await clientParty(actor, slug), input);
}

/** Logged by the team for a request that came in by phone, email or WhatsApp. */
export async function teamCreateRequest(actor: Actor, slug: string, input: unknown) {
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  return createRequest(teamParty(access), input);
}

export async function listRequests(projectId: string): Promise<ClientRequest[]> {
  return db
    .select()
    .from(clientRequests)
    .where(eq(clientRequests.projectId, projectId))
    .orderBy(desc(clientRequests.createdAt))
    .limit(200);
}

const updateInput = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  classification: z.enum(MAINTENANCE_CLASSES).optional(),
});

/** Team triage: status and the final who-pays classification. Clients are told about status. */
export async function updateRequest(actor: Actor, slug: string, id: string, input: unknown) {
  const data = parse(updateInput, input);
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND");
  const pending = await db.transaction(async (tx) => {
    const access: ProjectAccess = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const [row] = await tx
      .update(clientRequests)
      .set({
        ...data,
        ...(data.status === "resolved" || data.status === "declined"
          ? { resolvedAt: new Date() }
          : {}),
      })
      .where(and(eq(clientRequests.id, id), eq(clientRequests.projectId, access.project.id)))
      .returning();
    if (!row) throw new AppError("NOT_FOUND");
    await recordActivity(tx, {
      projectId: access.project.id,
      actorId: actor.id,
      type: data.classification ? "maintenance.classified" : "request.updated",
      entityType: "client_request",
      entityId: id,
      metadata: { status: row.status, classification: row.classification },
    });
    if (!data.status || row.side !== "client") return null;
    return notifyTx(tx, {
      userIds: await clientRecipients(tx, access.project.id),
      projectId: access.project.id,
      type: "request.updated",
      params: { title: row.title, status: row.status },
      href: portalHref(access.project.slug, "/requests"),
      dedupKey: `request:${id}:${row.status}`,
    });
  });
  if (pending) await deliver(pending);
}
