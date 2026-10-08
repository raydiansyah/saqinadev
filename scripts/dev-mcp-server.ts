/**
 * DEV ONLY. A small MCP server over Streamable HTTP for local testing of discovery, trust and
 * tool execution. Tools: echo (read-only), clock (read-only), write_note (destructive hint).
 *
 *   pnpm tsx scripts/dev-mcp-server.ts   → http://localhost:4200/mcp
 *   Optional bearer: DEV_MCP_TOKEN. Add ?sse=1 to answer as an event stream.
 */
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";

const TOOLS = [
  {
    name: "echo",
    description: "Returns the text it receives.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", maxLength: 500 } },
      required: ["text"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "clock",
    description: "Current server time (UTC).",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "write_note",
    description: "Pretends to write a note. Marked destructive so it needs approval.",
    inputSchema: { type: "object", properties: { note: { type: "string" } }, required: ["note"] },
    annotations: { destructiveHint: true },
  },
];

const read = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d));
  });

export function startDevMcpServer(port = 4200, token = process.env.DEV_MCP_TOKEN): Promise<Server> {
  const sessions = new Set<string>();
  const notes: string[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/mcp") return void res.writeHead(404).end();
    if (token && req.headers.authorization !== `Bearer ${token}`)
      return void res.writeHead(401).end();
    if (req.method === "DELETE") {
      sessions.delete(String(req.headers["mcp-session-id"]));
      return void res.writeHead(204).end();
    }
    const msg = JSON.parse((await read(req)) || "{}") as {
      id?: number;
      method: string;
      params?: Record<string, unknown>;
    };
    if (msg.id === undefined) return void res.writeHead(202).end();
    let result: unknown;
    const headers: Record<string, string> = {};
    if (msg.method === "initialize") {
      const id = randomUUID();
      sessions.add(id);
      headers["mcp-session-id"] = id;
      result = {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "saqina-dev-mcp", version: "1.0.0" },
      };
    } else if (!sessions.has(String(req.headers["mcp-session-id"]))) {
      return void res.writeHead(404).end();
    } else if (msg.method === "tools/list") {
      result = { tools: TOOLS };
    } else if (msg.method === "tools/call") {
      const name = String(msg.params?.name);
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      if (name === "echo") result = { content: [{ type: "text", text: String(args.text) }] };
      else if (name === "clock")
        result = {
          content: [{ type: "text", text: new Date().toISOString() }],
          structuredContent: { now: new Date().toISOString() },
        };
      else if (name === "write_note") {
        notes.push(String(args.note));
        result = {
          content: [{ type: "text", text: `note ${notes.length} stored (dev server memory)` }],
        };
      } else result = { content: [{ type: "text", text: "unknown tool" }], isError: true };
    } else {
      result = undefined;
    }
    const payload = JSON.stringify(
      result === undefined
        ? { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } }
        : { jsonrpc: "2.0", id: msg.id, result },
    );
    if (url.searchParams.get("sse") === "1") {
      res.writeHead(200, { ...headers, "content-type": "text/event-stream" });
      res.end(`event: message\ndata: ${payload}\n\n`);
    } else {
      res.writeHead(200, { ...headers, "content-type": "application/json" });
      res.end(payload);
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1]?.endsWith("dev-mcp-server.ts")) {
  void startDevMcpServer().then(() =>
    console.info("Dev MCP server on http://localhost:4200/mcp (DEV ONLY)"),
  );
}
