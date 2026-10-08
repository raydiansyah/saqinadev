import { createHmac, timingSafeEqual } from "node:crypto";
import type { AgentStrategy } from "@/lib/domain/enums";

/**
 * How Saqina reaches an external agent. Not every agent can be driven remotely: handoff and
 * manual work everywhere (copy, download, paste back); webhook is the one remote protocol
 * implemented now. API, CLI and MCP strategies are declared and say so honestly.
 */
export interface DispatchPayload {
  handoffId: string;
  project: string;
  task: string | null;
  instructions: string;
  contextVersion: number;
  callbackUrl: string;
  package: string;
}

export interface ExternalAgentAdapter {
  strategy: AgentStrategy;
  /** True when Saqina can send work itself; otherwise the user exports the package. */
  canDispatch: boolean;
  test?(endpoint: string, secret: string): Promise<{ ok: boolean; code: string }>;
  dispatch?(
    endpoint: string,
    secret: string,
    payload: DispatchPayload,
  ): Promise<{ ok: boolean; code: string }>;
}

export function sign(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** Constant-time check plus a 5-minute window against replays. */
export function verifySignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
  now = Date.now(),
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 5 * 60_000) return false;
  const expected = Buffer.from(sign(secret, timestamp, body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function postSigned(endpoint: string, secret: string, body: unknown) {
  const json = JSON.stringify(body);
  const timestamp = String(Date.now());
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-saqina-timestamp": timestamp,
        "x-saqina-signature": sign(secret, timestamp, json),
      },
      body: json,
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401 || response.status === 403)
      return { ok: false, code: "auth_failed" };
    return { ok: response.ok, code: response.ok ? "ok" : "provider_error" };
  } catch (error) {
    return { ok: false, code: (error as Error).name === "TimeoutError" ? "timeout" : "network" };
  }
}

const passive = (strategy: AgentStrategy): ExternalAgentAdapter => ({
  strategy,
  canDispatch: false,
});

export const AGENT_ADAPTERS: Record<AgentStrategy, ExternalAgentAdapter> = {
  handoff: passive("handoff"),
  manual: passive("manual"),
  api: passive("api"),
  cli: passive("cli"),
  mcp: passive("mcp"),
  webhook: {
    strategy: "webhook",
    canDispatch: true,
    test: (endpoint, secret) => postSigned(endpoint, secret, { type: "ping" }),
    dispatch: (endpoint, secret, payload) =>
      postSigned(endpoint, secret, { type: "handoff", ...payload }),
  },
};
