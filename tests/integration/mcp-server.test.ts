import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureTeamAgents } from "@/lib/agents/registry";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import {
  agents,
  agentTokens,
  documents,
  documentVersions,
  projectMembers,
  projects,
} from "@/lib/db/schema";
import { siteBase } from "@/lib/email/layout";
import { PROTOCOL_VERSION } from "@/lib/mcp/client";
import { handleMcpRequest } from "@/lib/mcp/server";
import {
  createAgentToken,
  listAgentTokens,
  revokeAgentToken,
  verifyAgentToken,
} from "@/lib/mcp/tokens";
import { approveProposal } from "@/lib/proposals/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

let owner: Actor;
let slug: string;
let projectId: string;
let writer: { id: string; name: string };
let reader: { id: string; name: string };

async function setup() {
  await resetDatabase();
  owner = await createUser("Owner", "owner@example.test");
  slug = await project(owner, "A point of sale for a small restaurant with table orders.");
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
  projectId = p.id;
  await ensureTeamAgents(db, projectId);
  const all = await db.select().from(agents).where(eq(agents.projectId, projectId));
  writer = all.find((a) => a.permissions.includes("write_documents")) as typeof writer;
  // A tool agent that may read but never write.
  reader = (
    await db
      .insert(agents)
      .values({
        projectId,
        name: "Read-only agent",
        type: "claude",
        provider: "anthropic",
        permissions: ["read_project", "read_prd"],
      })
      .returning()
  )[0];
}

const call = (
  token: string | null,
  body: unknown,
  headers: Record<string, string> = {},
  forSlug = slug,
) =>
  handleMcpRequest(
    new Request(`https://saqina.dev/api/projects/${forSlug}/mcp`, {
      method: "POST",
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    forSlug,
  );
let rpcId = 0;
const tool = async (token: string, name: string, args: Record<string, unknown> = {}) => {
  const res = await call(token, {
    jsonrpc: "2.0",
    id: ++rpcId,
    method: "tools/call",
    params: { name, arguments: args },
  });
  return (await res.json()) as {
    result?: {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content: { text: string }[];
    };
    error?: { code: number };
  };
};
const issue = (agent: { id: string }, scopes: string[]) =>
  createAgentToken(owner, slug, { label: "Claude Code", agentId: agent.id, scopes });
const doc = async (docSlug: string) =>
  (
    await db
      .select()
      .from(documents)
      .where(and(eq(documents.projectId, projectId), eq(documents.slug, docSlug)))
  )[0];

describe("agent tokens", () => {
  beforeEach(setup);

  it("shows the token once and stores only its hash", async () => {
    const created = await issue(writer, ["read_prd", "write_documents"]);
    expect(created.token).toMatch(/^sqn_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}$/);
    const rows = await db.select().from(agentTokens);
    expect(JSON.stringify(rows)).not.toContain(created.token);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    const listed = await listAgentTokens(owner, slug);
    expect(listed[0]).toMatchObject({
      label: "Claude Code",
      prefix: created.prefix,
      agentName: writer.name,
    });
    expect(JSON.stringify(listed)).not.toContain(created.token);
  });

  it("limits scopes to what the agent itself may do", async () => {
    const created = await issue(reader, ["read_prd", "write_documents"]);
    const [row] = await db.select().from(agentTokens).where(eq(agentTokens.id, created.id));
    expect(row.scopes).toEqual(["read_prd"]);
    await expect(issue(reader, ["write_documents"])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("is closed to outsiders and to agents of other projects", async () => {
    const stranger = await createUser("Stranger", "stranger@example.test");
    await expect(
      createAgentToken(stranger, slug, {
        label: "Intruder",
        agentId: writer.id,
        scopes: ["read_prd"],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createAgentToken(owner, slug, {
        label: "ok",
        agentId: crypto.randomUUID(),
        scopes: ["read_prd"],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("stops working when revoked, expired, for another project, or when its creator leaves", async () => {
    const t = await issue(writer, ["read_prd"]);
    expect(await verifyAgentToken(t.token, slug)).not.toBeNull();
    expect(await verifyAgentToken(t.token, "another-project")).toBeNull();
    await db.update(agentTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await verifyAgentToken(t.token, slug)).toBeNull();
    await db.update(agentTokens).set({ expiresAt: null });
    expect(await verifyAgentToken(t.token, slug)).not.toBeNull();
    await db.delete(projectMembers).where(eq(projectMembers.userId, owner.id));
    expect(await verifyAgentToken(t.token, slug)).toBeNull();
  });

  it("revokes by id and refuses junk", async () => {
    const t = await issue(writer, ["read_prd"]);
    await revokeAgentToken(owner, slug, t.id);
    expect(await verifyAgentToken(t.token, slug)).toBeNull();
    await expect(revokeAgentToken(owner, slug, t.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(revokeAgentToken(owner, slug, "not-a-uuid")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await verifyAgentToken("sqn_short", slug)).toBeNull();
  });
});

describe("MCP server protocol", () => {
  let token: string;
  beforeEach(async () => {
    await setup();
    token = (await issue(writer, ["read_project", "read_prd", "write_documents"])).token;
  });

  it("rejects a missing, wrong or foreign token without saying why", async () => {
    for (const bad of [null, "sqn_aaaaaaaa_" + "a".repeat(43), "nonsense"]) {
      const res = await call(bad, { jsonrpc: "2.0", id: 1, method: "ping" });
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain("Bearer");
    }
    const res = await call(token, { jsonrpc: "2.0", id: 1, method: "ping" }, {}, "another-project");
    expect(res.status).toBe(401);
  });

  it("rate limits repeated bad tokens from one address", async () => {
    const hammer = () =>
      call(
        "sqn_aaaaaaaa_" + "b".repeat(43),
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { "x-forwarded-for": "9.9.9.9" },
      );
    let last = 0;
    for (let i = 0; i < 22; i++) last = (await hammer()).status;
    expect(last).toBe(429);
  });

  it("speaks the protocol: initialize, ping, notifications and unknown methods", async () => {
    const init = await (
      await call(token, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} })
    ).json();
    expect(init.result).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "saqina" },
    });
    expect(
      (await (await call(token, { jsonrpc: "2.0", id: 2, method: "ping" })).json()).result,
    ).toEqual({});
    expect(
      (await call(token, { jsonrpc: "2.0", method: "notifications/initialized" })).status,
    ).toBe(202);
    expect(
      (await (await call(token, { jsonrpc: "2.0", id: 3, method: "nope" })).json()).error.code,
    ).toBe(-32601);
    expect((await call(token, "{not json")).status).toBe(400);
    expect((await call(token, { id: 1, method: "ping" })).status).toBe(400);
  });

  it("refuses foreign origins, oversized bodies and unsupported verbs", async () => {
    const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
    expect((await call(token, ping, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call(token, ping, { origin: new URL(siteBase()).origin })).status).toBe(200);
    expect((await call(token, "x".repeat(70_000))).status).toBe(413);
    const get = await handleMcpRequest(
      new Request("https://saqina.dev/x", { method: "GET" }),
      slug,
    );
    expect(get.status).toBe(405);
    expect(
      (await handleMcpRequest(new Request("https://saqina.dev/x", { method: "DELETE" }), slug))
        .status,
    ).toBe(204);
  });

  it("lists only the tools this token may run, never git or external tools", async () => {
    const list = async (t: string) =>
      (
        (await (await call(t, { jsonrpc: "2.0", id: 1, method: "tools/list" })).json()) as {
          result: { tools: { name: string; inputSchema: unknown }[] };
        }
      ).result.tools.map((x) => x.name);
    const full = await list(token);
    expect(full).toEqual(
      expect.arrayContaining([
        "read_project",
        "read_prd",
        "list_documents",
        "read_document",
        "propose_document_change",
      ]),
    );
    expect(full).not.toContain("commit_changes");
    expect(full).not.toContain("create_pull_request");
    const readOnly = await list((await issue(reader, ["read_prd"])).token);
    expect(readOnly).toContain("read_document");
    expect(readOnly).not.toContain("propose_document_change");
  });
});

describe("MCP documents", () => {
  let token: string;
  beforeEach(async () => {
    await setup();
    token = (await issue(writer, ["read_project", "read_prd", "write_documents"])).token;
  });

  it("reads documents live, with their version, and hides business documents", async () => {
    await db.insert(documents).values({
      projectId,
      type: "agreement",
      title: "Agreement",
      slug: "agreement",
      content: "Price: Rp100.000.000",
    });
    const listed = await tool(token, "list_documents");
    const slugs = (listed.result?.structuredContent?.documents as { slug: string }[]).map(
      (d) => d.slug,
    );
    expect(slugs).toEqual(expect.arrayContaining(["prd", "plan"]));
    expect(slugs).not.toContain("agreement");

    const prd = await tool(token, "read_document", { slug: "prd" });
    expect(prd.result?.structuredContent).toMatchObject({
      slug: "prd",
      version: (await doc("prd")).version,
    });
    expect(String(prd.result?.structuredContent?.content)).toContain("#");

    const secret = await tool(token, "read_document", { slug: "agreement" });
    expect(secret.result).toMatchObject({
      isError: true,
      structuredContent: { error: "NOT_FOUND" },
    });
    expect(JSON.stringify(secret)).not.toContain("Rp100");
  });

  it("turns a proposed change into a reviewable proposal and leaves the document alone", async () => {
    const before = await doc("prd");
    const proposed = await tool(token, "propose_document_change", {
      slug: "prd",
      content: "# PRD\n\nRewritten by an agent.\n",
      baseVersion: before.version,
      summary: "Tighten the scope",
    });
    expect(proposed.result?.structuredContent).toMatchObject({ status: "pending_approval" });
    expect(await doc("prd")).toMatchObject({ content: before.content, version: before.version });
  });

  it("applies the change only when a person approves, as a new version from MCP", async () => {
    const before = await doc("prd");
    const proposed = await tool(token, "propose_document_change", {
      slug: "prd",
      content: "# PRD\n\nApproved rewrite.\n",
      baseVersion: before.version,
    });
    const proposalId = proposed.result?.structuredContent?.proposalId as string;
    await approveProposal(owner, slug, { proposalId });
    const after = await doc("prd");
    expect(after.content).toBe("# PRD\n\nApproved rewrite.\n");
    expect(after.version).toBe(before.version + 1);
    const [v] = await db
      .select()
      .from(documentVersions)
      .where(
        and(eq(documentVersions.documentId, after.id), eq(documentVersions.version, after.version)),
      );
    expect(v.source).toBe("mcp");
  });

  it("refuses stale versions, unchanged text, business documents and read-only tokens", async () => {
    const before = await doc("prd");
    const stale = await tool(token, "propose_document_change", {
      slug: "prd",
      content: "x",
      baseVersion: before.version + 5,
    });
    expect(stale.result?.structuredContent).toMatchObject({ error: "CONFLICT" });
    const same = await tool(token, "propose_document_change", {
      slug: "prd",
      content: before.content,
      baseVersion: before.version,
    });
    expect(same.result?.structuredContent).toMatchObject({ error: "VALIDATION_ERROR" });
    await db
      .insert(documents)
      .values({ projectId, type: "proposal", title: "P", slug: "proposal", content: "terms" });
    const biz = await tool(token, "propose_document_change", {
      slug: "proposal",
      content: "x",
      baseVersion: 1,
    });
    expect(biz.result?.structuredContent).toMatchObject({ error: "NOT_FOUND" });
    const ro = (await issue(reader, ["read_prd"])).token;
    const denied = await tool(ro, "propose_document_change", {
      slug: "prd",
      content: "x",
      baseVersion: before.version,
    });
    expect(denied.result).toMatchObject({
      isError: true,
      structuredContent: { error: "AUTHORIZATION_ERROR" },
    });
  });

  it("re-checks the agent at approval time, and respects signed documents", async () => {
    const before = await doc("prd");
    const make = async (content: string) =>
      (
        await tool(token, "propose_document_change", {
          slug: "prd",
          content,
          baseVersion: before.version,
        })
      ).result?.structuredContent?.proposalId as string;
    const first = await make("# PRD\n\nFirst.\n");
    const second = await make("# PRD\n\nSecond.\n");

    // The agent loses its write permission after proposing: approval must not apply the change.
    await db
      .update(agents)
      .set({ permissions: ["read_prd"] })
      .where(eq(agents.id, writer.id));
    await expect(approveProposal(owner, slug, { proposalId: first })).rejects.toMatchObject({
      code: "AUTHORIZATION_ERROR",
    });
    expect((await doc("prd")).content).toBe(before.content);

    await db
      .update(agents)
      .set({ permissions: ["read_prd", "write_documents"] })
      .where(eq(agents.id, writer.id));
    await db.update(documents).set({ status: "signed" }).where(eq(documents.id, before.id));
    await expect(approveProposal(owner, slug, { proposalId: second })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect((await doc("prd")).content).toBe(before.content);
  });
});
