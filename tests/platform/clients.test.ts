import { describe, expect, it } from "vitest";
import { githubAdapter } from "@/lib/git/github";
import { McpClient } from "@/lib/mcp/client";

type Call = { url: string; init: RequestInit };

function fakeFetch(handler: (call: Call) => Response) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });

describe("MCP client", () => {
  it("initialises a session, pages tools/list and handles SSE replies", async () => {
    const { fn, calls } = fakeFetch(({ init }) => {
      const msg = JSON.parse(String(init.body)) as {
        id?: number;
        method: string;
        params?: { cursor?: string };
      };
      if (msg.method === "initialize")
        return json(
          {
            jsonrpc: "2.0",
            id: msg.id,
            result: { protocolVersion: "2025-06-18", serverInfo: { name: "x" } },
          },
          { "mcp-session-id": "s1" },
        );
      if (msg.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (msg.method === "tools/list")
        return msg.params?.cursor
          ? json({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "b" }] } })
          : json({
              jsonrpc: "2.0",
              id: msg.id,
              result: { tools: [{ name: "a" }], nextCursor: "2" },
            });
      return new Response(
        `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "ok" }] } })}\n\n`,
        {
          headers: { "content-type": "text/event-stream" },
        },
      );
    });
    const client = new McpClient("http://localhost/mcp", {}, 1000, fn);
    await client.initialize();
    expect((await client.listTools()).map((t) => t.name)).toEqual(["a", "b"]);
    expect((await client.callTool("a", {})).content[0].text).toBe("ok");
    expect((calls.at(-1)?.init.headers as Record<string, string>)["mcp-session-id"]).toBe("s1");
  });

  it("maps auth failures", async () => {
    const { fn } = fakeFetch(() => new Response(null, { status: 401 }));
    await expect(
      new McpClient("http://localhost/mcp", {}, 1000, fn).initialize(),
    ).rejects.toMatchObject({ code: "auth_failed" });
  });
});

describe("GitHub adapter", () => {
  it("commits several files through the Git data API without forcing the ref", async () => {
    const original = globalThis.fetch;
    const { fn, calls } = fakeFetch(({ url, init }) => {
      if (url.endsWith("/git/ref/heads/saqina/x")) return json({ object: { sha: "head1" } });
      if (url.endsWith("/git/commits/head1")) return json({ tree: { sha: "tree0" } });
      if (url.endsWith("/git/trees")) return json({ sha: "tree1" });
      if (url.endsWith("/git/commits") && init.method === "POST") return json({ sha: "commit1" });
      if (url.endsWith("/git/refs/heads/saqina/x") && init.method === "PATCH") return json({});
      return new Response(null, { status: 404 });
    });
    globalThis.fetch = fn;
    try {
      const out = await githubAdapter.commitChanges(
        { fullName: "acme/app", baseUrl: null },
        "token",
        {
          branch: "saqina/x",
          message: "msg",
          files: [
            { path: "a.md", content: "A" },
            { path: "b.md", content: "B" },
          ],
        },
      );
      expect(out.sha).toBe("commit1");
      const tree = JSON.parse(String(calls.find((c) => c.url.endsWith("/git/trees"))?.init.body));
      expect(tree.tree.map((t: { path: string }) => t.path)).toEqual(["a.md", "b.md"]);
      const patch = JSON.parse(String(calls.at(-1)?.init.body));
      expect(patch).toEqual({ sha: "commit1", force: false });
      expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer token");
    } finally {
      globalThis.fetch = original;
    }
  });
});
