import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { clients, clientUsers, projects } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";

/**
 * Client portal authorization. Portal users are never project members, so none of the
 * internal guards (loadProjectAccess) let them in; this is the only door, and it opens only
 * for portal-enabled, non-archived projects of a client the user belongs to.
 */

export interface ClientProjectAccess {
  actor: Actor;
  client: { id: string; name: string; company: string };
  project: typeof projects.$inferSelect;
}

const visible = and(eq(projects.portalEnabled, true), isNull(projects.archivedAt));

export async function isClientUser(actor: Actor): Promise<boolean> {
  const [row] = await db
    .select({ id: clientUsers.clientId })
    .from(clientUsers)
    .where(eq(clientUsers.userId, actor.id))
    .limit(1);
  return Boolean(row);
}

/** Clients the user can act for (a person may represent more than one company). */
export async function portalClients(actor: Actor) {
  return db
    .select({ id: clients.id, name: clients.name, company: clients.company })
    .from(clientUsers)
    .innerJoin(clients, eq(clients.id, clientUsers.clientId))
    .where(and(eq(clientUsers.userId, actor.id), eq(clients.status, "active")))
    .orderBy(asc(clients.name));
}

export async function portalProjects(actor: Actor) {
  return db
    .select({ project: projects, clientName: clients.name })
    .from(clientUsers)
    .innerJoin(clients, eq(clients.id, clientUsers.clientId))
    .innerJoin(projects, eq(projects.clientId, clients.id))
    .where(and(eq(clientUsers.userId, actor.id), eq(clients.status, "active"), visible))
    .orderBy(asc(projects.name));
}

export async function loadClientProjectAccess(
  actor: Actor,
  slug: string,
): Promise<ClientProjectAccess> {
  const [row] = await db
    .select({
      project: projects,
      client: { id: clients.id, name: clients.name, company: clients.company },
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(
      clientUsers,
      and(eq(clientUsers.clientId, clients.id), eq(clientUsers.userId, actor.id)),
    )
    .where(and(eq(projects.slug, slug), eq(clients.status, "active"), visible))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND");
  return { actor, client: row.client, project: row.project };
}
