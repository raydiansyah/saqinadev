import "server-only";
import { eq } from "drizzle-orm";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { projectMembers } from "@/lib/db/schema";
import { isClientUser } from "@/lib/portal/access";
import type { DocAudience } from "./content";

/**
 * Who may read which guide. The team's guides are for people who run projects; the clients'
 * guides are for people who follow one on the portal. Portal users are never project members, so
 * a client does not see the team's guides. A person who is both reads both.
 */
export async function canReadDocs(actor: Actor, audience: DocAudience): Promise<boolean> {
  const client = await isClientUser(actor);
  if (audience === "client") return client;
  if (!client) return true;
  const [member] = await db
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, actor.id))
    .limit(1);
  return Boolean(member);
}
