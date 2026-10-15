import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { agentCan } from "@/lib/agents/capabilities";
import { db } from "@/lib/db/client";
import { tools } from "@/lib/db/schema";
import { siteBase } from "@/lib/email/layout";
import { isAppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { allow } from "@/lib/rate-limit";
import { executeTool } from "@/lib/tools/executor";
import { ensureProjectTools } from "@/lib/tools/registry";
import { PROTOCOL_VERSION } from "./client";
import { verifyAgentToken } from "./tokens";

/**
 * Saqina's own MCP server (Streamable HTTP, JSON-RPC 2.0), one endpoint per project. Stateless:
 * serverless instances share no memory, so there is no session and no server-initiated stream.
 * Every call goes through `executeTool`, so tool policy, agent permissions, rate limits and the
 * audit trail are the same ones the in-app agents use.
 */

/** The tools this server offers. Git and external MCP tools stay inside Saqina. */
export const MCP_TOOL_NAMES = [
  "read_project",
  "read_prd",
  "list_documents",
  "read_document",
  "search_memory",
  "propose_document_change",
] as const;

const MAX_BODY = 60_000;
const ERROR = { parse: -32700, request: -32600, method: -32601, params: -32602 } as const;

type Id = string | number | null;
const rpc = (id: Id, result: unknown) => Response.json({ jsonrpc: "2.0", id, result });
const rpcError = (id: Id, code: number, message: string, status = 200) =>
  Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
const http = (status: number, error: string, headers: Record<string, string> = {}) =>
  Response.json({ error }, { status, headers });

const clientIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  request.headers.get("x-real-ip")?.trim() ||
  "unknown";

/** Browsers must not be able to call this from another site; agents send no Origin at all. */
function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(siteBase()).host;
  } catch {
    return false;
  }
}

const bearer = (request: Request) =>
  /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;

export async function handleMcpRequest(request: Request, slug: string): Promise<Response> {
  if (!originAllowed(request)) return http(403, "origin_not_allowed");
  // No session to end, no stream to open.
  if (request.method === "DELETE") return new Response(null, { status: 204 });
  if (request.method === "GET") return http(405, "method_not_allowed", { allow: "POST, DELETE" });
  if (request.method !== "POST") return http(405, "method_not_allowed", { allow: "POST, DELETE" });

  const ip = clientIp(request);
  const token = bearer(request);
  const verified = token ? await verifyAgentToken(token, slug) : null;
  if (!verified) {
    // Guessing tokens is rate limited per address, and a miss reveals nothing about why.
    if (!(await allow(`mcp-bad:${ip}`, 20, 60_000))) return http(429, "rate_limited");
    return http(401, "unauthorized", { "www-authenticate": 'Bearer realm="saqina"' });
  }
  if (!(await allow(`mcp:${verified.tokenId}`, 120, 60_000))) return http(429, "rate_limited");

  const raw = await request.text();
  if (raw.length > MAX_BODY) return http(413, "too_large");
  let message: { jsonrpc?: string; id?: Id; method?: string; params?: Record<string, unknown> };
  try {
    message = JSON.parse(raw);
  } catch {
    return rpcError(null, ERROR.parse, "Parse error", 400);
  }
  if (
    !message ||
    typeof message !== "object" ||
    Array.isArray(message) ||
    message.jsonrpc !== "2.0"
  )
    return rpcError(null, ERROR.request, "Invalid request", 400);
  // A notification has no id and gets no answer.
  if (message.id === undefined) return new Response(null, { status: 202 });
  const id = message.id;

  switch (message.method) {
    case "initialize":
      return rpc(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "saqina", version: "1" },
      });
    case "ping":
      return rpc(id, {});
    case "tools/list": {
      await ensureProjectTools(db, verified.access.project.id);
      const rows = await db
        .select()
        .from(tools)
        .where(
          and(
            eq(tools.projectId, verified.access.project.id),
            eq(tools.source, "internal"),
            eq(tools.trust, "enabled"),
            inArray(tools.name, [...MCP_TOOL_NAMES]),
          ),
        );
      // Only what this token could actually run.
      const visible = rows.filter(
        (t) => !t.agentPermission || agentCan(verified.agent, t.agentPermission),
      );
      return rpc(id, {
        tools: visible.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    }
    case "tools/call": {
      const params = message.params ?? {};
      const name = typeof params.name === "string" ? params.name : "";
      if (!(MCP_TOOL_NAMES as readonly string[]).includes(name))
        return rpcError(id, ERROR.params, `Unknown tool: ${name.slice(0, 80)}`);
      const args =
        params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {};
      try {
        const result = await executeTool({
          access: verified.access,
          tool: name,
          input: args,
          actor: {
            kind: "agent",
            agentId: verified.agent.id,
            name: verified.agent.name,
            permissions: verified.agent.permissions,
          },
          // Clients reuse small JSON-RPC ids across sessions, so the key is never derived from them.
          idempotencyKey: `mcp:${verified.tokenId}:${randomUUID()}`,
        });
        if (result.status !== "succeeded")
          return rpc(id, {
            content: [{ type: "text", text: "This call needs approval in Saqina." }],
            isError: true,
          });
        return rpc(id, {
          content: [{ type: "text", text: JSON.stringify(result.output) }],
          structuredContent: result.output,
        });
      } catch (error) {
        // A tool failure is a result the agent can read, not a protocol error. Codes only.
        const code = isAppError(error) ? error.code : "INTERNAL_ERROR";
        if (code === "INTERNAL_ERROR") log.error("mcp.tool_failed", { name, error: String(error) });
        return rpc(id, {
          content: [{ type: "text", text: `Error: ${code}` }],
          isError: true,
          structuredContent: { error: code },
        });
      }
    }
    default:
      return rpcError(id, ERROR.method, "Method not found");
  }
}
