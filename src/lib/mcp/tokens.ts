import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import * as z from "zod";
import { agentCan } from "@/lib/agents/capabilities";
import { ensureTeamAgents } from "@/lib/agents/registry";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { can, loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { agents, agentTokens, projects, users } from "@/lib/db/schema";
import type { AgentPermission } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { allow } from "@/lib/rate-limit";
import { parse } from "@/lib/validation";

/**
 * Bearer tokens for the inbound MCP server. Only a hash is stored and the token is shown once,
 * like a client invitation. A token acts as one of the project's agents, on behalf of the
 * member who created it: it can never do more than either of them could.
 */

/** What a token may be scoped to. Writes are proposals only; nothing here can push or deploy. */
export const TOKEN_SCOPES = [
  "read_project",
  "read_prd",
  "read_tasks",
  "read_memory",
  "write_documents",
] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

const TOKEN_PATTERN = /^sqn_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}$/;
const LAST_USED_EVERY_MS = 60_000;
const MAX_ACTIVE = 20;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const createInput = z.object({
  label: z.string().trim().min(2).max(80),
  agentId: z.uuid(),
  scopes: z.array(z.enum(TOKEN_SCOPES)).min(1).max(TOKEN_SCOPES.length),
  expiresInDays: z.int().min(1).max(365).nullable().default(90),
});

export interface CreatedToken {
  id: string;
  /** The only time the full token exists in readable form. */
  token: string;
  prefix: string;
}

export async function createAgentToken(
  actor: Actor,
  slug: string,
  input: unknown,
): Promise<CreatedToken> {
  const data = parse(createInput, input);
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  if (data.scopes.includes("write_documents") && !can(access.role, "content:write"))
    throw new AppError("AUTHORIZATION_ERROR");
  if (!(await allow(`mcp-token:${actor.id}`, 20, 60 * 60 * 1000))) throw new AppError("RATE_LIMIT");

  // Specialists are created lazily; make sure the agent list the person chose from exists.
  await ensureTeamAgents(db, access.project.id);
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, data.agentId), eq(agents.projectId, access.project.id)));
  if (!agent) throw new AppError("NOT_FOUND");
  // A scope the agent itself does not hold would be dead weight (and misleading in the list).
  const scopes = data.scopes.filter((s) => agentCan(agent, s));
  if (scopes.length === 0)
    throw new AppError("VALIDATION_ERROR", "Agent lacks those permissions", { scopes: "agent" });

  // 8 characters to recognise it by, then 256 bits that are the actual secret.
  const token = `sqn_${randomBytes(6).toString("base64url")}_${randomBytes(32).toString("base64url")}`;
  const prefix = token.slice(0, 12);
  const id = await db.transaction(async (tx) => {
    const active = await tx
      .select({ id: agentTokens.id })
      .from(agentTokens)
      .where(and(eq(agentTokens.projectId, access.project.id), isNull(agentTokens.revokedAt)));
    if (active.length >= MAX_ACTIVE)
      throw new AppError("VALIDATION_ERROR", "Too many tokens", { label: "limit" });
    const [row] = await tx
      .insert(agentTokens)
      .values({
        projectId: access.project.id,
        agentId: agent.id,
        label: data.label,
        prefix,
        tokenHash: hashToken(token),
        scopes,
        expiresAt: data.expiresInDays
          ? new Date(Date.now() + data.expiresInDays * 86_400_000)
          : null,
        createdBy: actor.id,
      })
      .returning({ id: agentTokens.id });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "mcp_token.created",
      entityType: "agent_token",
      entityId: row.id,
      metadata: { agent: agent.name, scopes: scopes.join(","), prefix },
    });
    return row.id;
  });
  return { id, token, prefix };
}

export async function listAgentTokens(actor: Actor, slug: string) {
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  return db
    .select({
      id: agentTokens.id,
      label: agentTokens.label,
      prefix: agentTokens.prefix,
      agentName: agents.name,
      scopes: agentTokens.scopes,
      expiresAt: agentTokens.expiresAt,
      revokedAt: agentTokens.revokedAt,
      lastUsedAt: agentTokens.lastUsedAt,
      createdAt: agentTokens.createdAt,
    })
    .from(agentTokens)
    .leftJoin(agents, eq(agents.id, agentTokens.agentId))
    .where(eq(agentTokens.projectId, access.project.id))
    .orderBy(desc(agentTokens.createdAt));
}

export async function revokeAgentToken(actor: Actor, slug: string, tokenId: string) {
  if (!z.uuid().safeParse(tokenId).success) throw new AppError("NOT_FOUND");
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(agentTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(agentTokens.id, tokenId),
          eq(agentTokens.projectId, access.project.id),
          isNull(agentTokens.revokedAt),
        ),
      )
      .returning({ id: agentTokens.id, prefix: agentTokens.prefix });
    if (!row) throw new AppError("NOT_FOUND");
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "mcp_token.revoked",
      entityType: "agent_token",
      entityId: row.id,
      metadata: { prefix: row.prefix },
    });
  });
}

export interface VerifiedToken {
  tokenId: string;
  access: ProjectAccess;
  agent: { id: string; name: string; permissions: AgentPermission[] };
}

/**
 * Resolves a bearer token for one project, or null. Everything that can have changed since the
 * token was issued is re-read: revocation, expiry, the agent's permissions and the creator's
 * membership. The effective permissions are the token's scopes within the agent's own.
 */
export async function verifyAgentToken(token: string, slug: string): Promise<VerifiedToken | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const [row] = await db
    .select({ t: agentTokens, projectSlug: projects.slug })
    .from(agentTokens)
    .innerJoin(projects, eq(projects.id, agentTokens.projectId))
    .where(eq(agentTokens.tokenHash, hashToken(token)));
  if (!row || row.projectSlug !== slug) return null;
  const t = row.t;
  if (t.revokedAt || (t.expiresAt && t.expiresAt <= new Date()) || !t.agentId || !t.createdBy)
    return null;

  const [agent] = await db.select().from(agents).where(eq(agents.id, t.agentId));
  const [creator] = await db.select().from(users).where(eq(users.id, t.createdBy));
  if (!agent || !creator) return null;
  let access: ProjectAccess;
  try {
    access = await loadProjectAccess(
      { id: creator.id, name: creator.name, email: creator.email, image: creator.image ?? null },
      { id: t.projectId },
      "project:read",
    );
  } catch {
    return null; // the creator left the project: so did their tokens
  }
  const permissions = t.scopes.filter(
    (s) => agentCan(agent, s) && (s !== "write_documents" || can(access.role, "content:write")),
  );
  if (!t.lastUsedAt || Date.now() - t.lastUsedAt.getTime() > LAST_USED_EVERY_MS)
    await db.update(agentTokens).set({ lastUsedAt: new Date() }).where(eq(agentTokens.id, t.id));
  return { tokenId: t.id, access, agent: { id: agent.id, name: agent.name, permissions } };
}
