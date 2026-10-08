import { eq } from "drizzle-orm";
import { verifySignature } from "@/lib/agents/external/adapters";
import { importResultTx } from "@/lib/agents/handoff";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { agentHandoffs, agents, projects, users } from "@/lib/db/schema";
import { log } from "@/lib/log";
import { allow } from "@/lib/rate-limit";
import { withSecret } from "@/lib/secrets/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (status: number, code: string) =>
  Response.json({ ok: status < 300, code }, { status });

/**
 * Result callback for webhook agents. Authenticated by the HMAC signature with the agent's
 * own secret (no session). The result is stored for review, never applied automatically.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/agents/callback/[handoffId]">,
) {
  const { handoffId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(handoffId)) return reply(404, "not_found");
  if (!allow(`callback:${handoffId}`, 10, 60_000)) return reply(429, "rate_limited");
  const body = await request.text();
  if (body.length > 60_000) return reply(413, "too_large");

  const [row] = await db
    .select({ handoff: agentHandoffs, agent: agents, project: projects })
    .from(agentHandoffs)
    .innerJoin(agents, eq(agents.id, agentHandoffs.agentId))
    .innerJoin(projects, eq(projects.id, agentHandoffs.projectId))
    .where(eq(agentHandoffs.id, handoffId));
  if (!row?.agent.credentialId || row.agent.connectionStrategy !== "webhook")
    return reply(404, "not_found");
  if (["completed", "cancelled", "result_imported"].includes(row.handoff.status))
    return reply(409, "closed");

  const valid = await withSecret(
    row.agent.credentialId,
    { kind: "agent", projectId: row.project.id },
    async (secret) =>
      verifySignature(
        secret,
        request.headers.get("x-saqina-timestamp") ?? "",
        body,
        request.headers.get("x-saqina-signature") ?? "",
      ),
  );
  if (!valid) return reply(401, "bad_signature");

  // Acts on behalf of whoever created the handoff, within that project.
  const creatorId = row.handoff.createdBy;
  const [creator] = creatorId ? await db.select().from(users).where(eq(users.id, creatorId)) : [];
  if (!creator) return reply(409, "no_owner");
  try {
    const access = await loadProjectAccess(
      { id: creator.id, name: creator.name, email: creator.email, image: creator.image },
      { id: row.project.id },
      "content:write",
    );
    let raw = body;
    try {
      const parsed = JSON.parse(body) as { result?: unknown };
      if (parsed.result) raw = JSON.stringify(parsed.result);
    } catch {
      // Plain text body: stored as the summary.
    }
    await importResultTx(access, row.handoff, raw);
    return reply(200, "imported");
  } catch (error) {
    log.warn("agent.callback_failed", { handoffId, error: String(error) });
    return reply(400, "rejected");
  }
}
