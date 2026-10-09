import "server-only";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  clientInvitations,
  clients,
  clientUsers,
  invoices,
  projects,
  users,
} from "@/lib/db/schema";
import { CURRENCIES, type Currency } from "@/lib/domain/business";
import { AppError } from "@/lib/errors";
import { requireOrg } from "@/lib/organizations/service";
import { parse } from "@/lib/validation";

export type Client = typeof clients.$inferSelect;

const clientInput = z.object({
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160).default(""),
  email: z.union([z.literal(""), z.email().trim().toLowerCase().max(200)]).default(""),
  phone: z.string().trim().max(40).default(""),
  address: z.string().trim().max(400).default(""),
  internalNotes: z.string().trim().max(4000).default(""),
});

export interface ClientListItem {
  id: string;
  name: string;
  company: string;
  email: string;
  status: Client["status"];
  projectCount: number;
  portalUserCount: number;
}

export async function listClients(actor: Actor): Promise<ClientListItem[]> {
  const { org } = await requireOrg(actor, "org:read");
  const rows = await db
    .select()
    .from(clients)
    .where(eq(clients.organizationId, org.id))
    .orderBy(asc(clients.status), asc(clients.name));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [projectCounts, userCounts] = await Promise.all([
    db
      .select({ id: projects.clientId, n: count() })
      .from(projects)
      .where(and(inArray(projects.clientId, ids), isNull(projects.archivedAt)))
      .groupBy(projects.clientId),
    db
      .select({ id: clientUsers.clientId, n: count() })
      .from(clientUsers)
      .where(inArray(clientUsers.clientId, ids))
      .groupBy(clientUsers.clientId),
  ]);
  const byId = (list: { id: string | null; n: number }[]) =>
    new Map(list.map((x) => [x.id, Number(x.n)]));
  const pc = byId(projectCounts);
  const uc = byId(userCounts);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company,
    email: r.email,
    status: r.status,
    projectCount: pc.get(r.id) ?? 0,
    portalUserCount: uc.get(r.id) ?? 0,
  }));
}

/** A client of the actor's organization; anything else is NOT_FOUND. */
export async function loadClient(actor: Actor, clientId: string, manage = false) {
  const { org } = await requireOrg(actor, manage ? "clients:manage" : "org:read");
  if (!z.uuid().safeParse(clientId).success) throw new AppError("NOT_FOUND");
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, org.id)))
    .limit(1);
  if (!client) throw new AppError("NOT_FOUND");
  return { org, client };
}

export async function getClientDetail(actor: Actor, clientId: string) {
  const { client } = await loadClient(actor, clientId);
  const [clientProjects, portalUsers, invitations] = await Promise.all([
    db
      .select({
        slug: projects.slug,
        name: projects.name,
        status: projects.status,
        portalEnabled: projects.portalEnabled,
      })
      .from(projects)
      .where(and(eq(projects.clientId, client.id), isNull(projects.archivedAt)))
      .orderBy(asc(projects.name)),
    db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        since: clientUsers.createdAt,
      })
      .from(clientUsers)
      .innerJoin(users, eq(users.id, clientUsers.userId))
      .where(eq(clientUsers.clientId, client.id)),
    db
      .select({
        id: clientInvitations.id,
        email: clientInvitations.email,
        expiresAt: clientInvitations.expiresAt,
        acceptedAt: clientInvitations.acceptedAt,
        revokedAt: clientInvitations.revokedAt,
        createdAt: clientInvitations.createdAt,
      })
      .from(clientInvitations)
      .where(eq(clientInvitations.clientId, client.id))
      .orderBy(asc(clientInvitations.createdAt)),
  ]);
  return { client, projects: clientProjects, portalUsers, invitations };
}

export async function createClient(actor: Actor, input: unknown) {
  const data = parse(clientInput, input);
  const { org } = await requireOrg(actor, "clients:manage");
  return db.transaction(async (tx) => {
    const [client] = await tx
      .insert(clients)
      .values({ ...data, organizationId: org.id })
      .returning({ id: clients.id });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "organization",
      type: "client.created",
      entityType: "client",
      entityId: client.id,
    });
    return client;
  });
}

export async function updateClient(actor: Actor, clientId: string, input: unknown) {
  const data = parse(clientInput.extend({ status: z.enum(["active", "archived"]) }), input);
  const { client } = await loadClient(actor, clientId, true);
  await db.update(clients).set(data).where(eq(clients.id, client.id));
}

/** Removes a portal user's access to this client. The account itself stays. */
export async function removePortalUser(actor: Actor, clientId: string, userId: string) {
  const { client } = await loadClient(actor, clientId, true);
  await db.transaction(async (tx) => {
    await tx
      .delete(clientUsers)
      .where(and(eq(clientUsers.clientId, client.id), eq(clientUsers.userId, userId)));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "organization",
      type: "client.portal_user_removed",
      entityType: "client",
      entityId: client.id,
      metadata: { userId },
    });
  });
}

const projectClientInput = z.object({
  clientId: z.uuid().nullable(),
  portalEnabled: z.boolean(),
  currency: z.enum(CURRENCIES as [Currency, ...Currency[]]),
});

/** Assigns the project's client, toggles the portal and sets the billing currency. */
export async function setProjectClient(actor: Actor, slug: string, input: unknown) {
  const data = parse(projectClientInput, input);
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    if (data.clientId) {
      const [owned] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(eq(clients.id, data.clientId), eq(clients.organizationId, project.organizationId)),
        )
        .limit(1);
      if (!owned) throw new AppError("NOT_FOUND");
    }
    // Currency is fixed once an invoice exists, so amounts never change meaning.
    if (data.currency !== project.currency) {
      const [used] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.projectId, project.id))
        .limit(1);
      if (used)
        throw new AppError("CONFLICT", "Currency is locked once invoices exist", {
          currency: "billing.currencyLocked",
        });
    }
    const portalEnabled = data.clientId ? data.portalEnabled : false;
    await tx
      .update(projects)
      .set({
        clientId: data.clientId,
        portalEnabled,
        currency: data.currency,
      })
      .where(eq(projects.id, project.id));
    if (data.clientId !== project.clientId)
      await recordActivity(tx, {
        projectId: project.id,
        actorId: actor.id,
        type: "client.assigned",
        entityType: "project",
        entityId: project.id,
        metadata: { clientId: data.clientId },
      });
    if (portalEnabled !== project.portalEnabled)
      await recordActivity(tx, {
        projectId: project.id,
        actorId: actor.id,
        type: portalEnabled ? "portal.enabled" : "portal.disabled",
        entityType: "project",
        entityId: project.id,
      });
  });
}

export async function listClientOptions(actor: Actor) {
  const { org } = await requireOrg(actor, "org:read");
  return db
    .select({ id: clients.id, name: clients.name, company: clients.company })
    .from(clients)
    .where(and(eq(clients.organizationId, org.id), eq(clients.status, "active")))
    .orderBy(asc(clients.name));
}
