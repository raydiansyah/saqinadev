import "server-only";
import { asc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { projectMessages, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { clientRecipients, deliver, notifyTx, teamRecipients } from "@/lib/notifications/service";
import { allow } from "@/lib/rate-limit";
import { parse } from "@/lib/validation";
import { clientParty, type Party, portalHref, teamHref, teamParty } from "./shared";

/** The project's client thread: decisions discussed here stay attached to the project. */

export interface MessageView {
  id: string;
  side: "client" | "team";
  body: string;
  authorName: string | null;
  createdAt: Date;
}

export async function listMessages(projectId: string, limit = 200): Promise<MessageView[]> {
  const rows = await db
    .select({
      id: projectMessages.id,
      side: projectMessages.side,
      body: projectMessages.body,
      authorName: users.name,
      createdAt: projectMessages.createdAt,
    })
    .from(projectMessages)
    .leftJoin(users, eq(users.id, projectMessages.authorId))
    .where(eq(projectMessages.projectId, projectId))
    .orderBy(asc(projectMessages.createdAt))
    .limit(limit);
  return rows;
}

async function post(party: Party, input: unknown) {
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(4000) }), input);
  if (!allow(`message:${party.actor.id}`, 30, 60_000)) throw new AppError("RATE_LIMIT");
  const pending = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(projectMessages)
      .values({ projectId: party.project.id, authorId: party.actor.id, side: party.side, body })
      .returning({ id: projectMessages.id });
    await recordActivity(tx, {
      projectId: party.project.id,
      actorId: party.actor.id,
      type: "message.posted",
      entityType: "project_message",
      entityId: row.id,
      metadata: { side: party.side },
    });
    const toClient = party.side === "team";
    return notifyTx(tx, {
      userIds: toClient
        ? await clientRecipients(tx, party.project.id)
        : await teamRecipients(tx, party.project.id),
      projectId: party.project.id,
      type: "message.posted",
      params: { author: party.actor.name, project: party.project.name },
      href: toClient
        ? portalHref(party.project.slug, "/messages")
        : teamHref(party.project.slug, "/messages"),
      dedupKey: `message:${row.id}`,
      email: toClient,
    });
  });
  await deliver(pending);
}

export async function teamPostMessage(actor: Actor, slug: string, input: unknown) {
  return post(teamParty(await loadProjectAccess(actor, { slug }, "content:write")), input);
}

export async function clientPostMessage(actor: Actor, slug: string, input: unknown) {
  return post(await clientParty(actor, slug), input);
}
