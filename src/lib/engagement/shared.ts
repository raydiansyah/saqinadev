import "server-only";
import type { Actor } from "@/lib/auth/actor";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { type ClientProjectAccess, loadClientProjectAccess } from "@/lib/portal/access";

/**
 * Engagement records are written by two kinds of people: project members (team) and portal
 * users (client). Both end up with the same project row; `side` says which door they used.
 */
export type Side = "team" | "client";

export interface Party {
  actor: Actor;
  project: ProjectAccess["project"];
  side: Side;
  clientId: string | null;
}

export const teamParty = (access: ProjectAccess): Party => ({
  actor: access.actor,
  project: access.project,
  side: "team",
  clientId: access.project.clientId,
});

export async function clientParty(actor: Actor, slug: string): Promise<Party> {
  const access: ClientProjectAccess = await loadClientProjectAccess(actor, slug);
  return { actor, project: access.project, side: "client", clientId: access.client.id };
}

/** Internal services (tasks, scope) expect a member access; client-approved side effects use this. */
export const asAccess = (party: Party): ProjectAccess => ({
  actor: party.actor,
  project: party.project,
  role: "owner",
});

export const portalHref = (slug: string, path = "") => `/portal/projects/${slug}${path}`;
export const teamHref = (slug: string, path = "") => `/project/${slug}${path}`;
