/**
 * Minimal MCP client over Streamable HTTP (JSON-RPC 2.0): initialize, tools/list, tools/call.
 * Responses may come back as JSON or as a server-sent event stream. No SDK, no stdio: local
 * servers are reached over HTTP on localhost.
 */

export const PROTOCOL_VERSION = "2025-06-18";

export type McpErrorCode =
  | "auth_failed"
  | "not_found"
  | "timeout"
  | "network"
  | "protocol"
  | "tool_error";

export class McpError extends Error {
  constructor(readonly code: McpErrorCode) {
    super(`MCP error: ${code}`);
    this.name = "McpError";
  }
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; title?: string };
}

export interface McpCallResult {
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
};

export class McpClient {
  private sessionId: string | null = null;
  private protocol = PROTOCOL_VERSION;
  private nextId = 1;
  serverInfo: { name?: string; version?: string } = {};

  constructor(
    private readonly endpoint: string,
    private readonly headers: Record<string, string> = {},
    private readonly timeoutMs = 20_000,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async post(
    body: Record<string, unknown>,
    expectReply: boolean,
  ): Promise<JsonRpcMessage | null> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": this.protocol,
          ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
          ...this.headers,
        },
        body: JSON.stringify({ jsonrpc: "2.0", ...body }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new McpError((error as Error).name === "TimeoutError" ? "timeout" : "network");
    }
    if (response.status === 401 || response.status === 403) throw new McpError("auth_failed");
    if (response.status === 404) throw new McpError("not_found");
    if (!response.ok && response.status !== 202) throw new McpError("protocol");
    const session = response.headers.get("mcp-session-id");
    if (session) this.sessionId = session;
    if (!expectReply) return null;

    const type = response.headers.get("content-type") ?? "";
    if (type.includes("text/event-stream")) {
      const text = await response.text();
      for (const event of text.split(/\r?\n\r?\n/)) {
        const data = event
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const message = JSON.parse(data) as JsonRpcMessage;
        if (message.id === body.id) return message;
      }
      throw new McpError("protocol");
    }
    return (await response.json()) as JsonRpcMessage;
  }

  private async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    const reply = await this.post({ id, method, params }, true);
    if (!reply || reply.error) throw new McpError("protocol");
    return reply.result as T;
  }

  async initialize(): Promise<void> {
    const result = await this.call<{
      protocolVersion: string;
      serverInfo?: { name?: string; version?: string };
    }>("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "saqina-dev", version: "4.0.0" },
    });
    this.protocol = result.protocolVersion || PROTOCOL_VERSION;
    this.serverInfo = result.serverInfo ?? {};
    await this.post({ method: "notifications/initialized" }, false);
  }

  async listTools(limit = 200): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.call<{ tools: McpTool[]; nextCursor?: string }>(
        "tools/list",
        cursor ? { cursor } : {},
      );
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor && tools.length < limit);
    return tools.slice(0, limit);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    return this.call<McpCallResult>("tools/call", { name, arguments: args });
  }

  /** Ends the server session (best effort). */
  async close(): Promise<void> {
    if (!this.sessionId) return;
    await this.fetcher(this.endpoint, {
      method: "DELETE",
      headers: { "mcp-session-id": this.sessionId, ...this.headers },
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
  }
}
