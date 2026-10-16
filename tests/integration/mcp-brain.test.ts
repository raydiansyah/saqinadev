import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { processProjectChanges } from "@/lib/brain/process";
import { db } from "@/lib/db/client";
import { agents, memories, projects, toolExecutions } from "@/lib/db/schema";
import { indexDocs } from "@/lib/docmap/index-docs";
import { handleMcpRequest } from "@/lib/mcp/server";
import { createAgentToken } from "@/lib/mcp/tokens";
import { createRequirement } from "@/lib/requirements/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

let owner: Actor;
let slug: string;
let projectId: string;
let writer: { id: string };
let reader: { id: string };

const permsWrite = ["read_project", "read_prd", "read_memory", "write_memory"] as const;

async function setup() {
  await resetDatabase();
  owner = await createUser("Owner", "owner@example.test");
  slug = await project(owner, "A point of sale for a small restaurant with table orders.");
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
  projectId = p.id;
  [writer] = await db
    .insert(agents)
    .values({
      projectId,
      name: "Memory agent",
      type: "claude",
      provider: "anthropic",
      permissions: [...permsWrite],
    })
    .returning();
  [reader] = await db
    .insert(agents)
    .values({
      projectId,
      name: "Read-only agent",
      type: "claude",
      provider: "anthropic",
      permissions: ["read_project", "read_prd"],
    })
    .returning();
}

const token = async (agent: { id: string }, scopes: readonly string[]) =>
  (
    await createAgentToken(owner, slug, {
      label: "Agent",
      agentId: agent.id,
      scopes: [...scopes],
    })
  ).token;
let rpcId = 0;
const rpc = async (tok: string, method: string, params: Record<string, unknown> = {}) => {
  const res = await handleMcpRequest(
    new Request(`https://saqina.dev/api/projects/${slug}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
    slug,
  );
  return (await res.json()) as {
    result?: {
      isError?: boolean;
      structuredContent?: Record<string, any>;
      tools?: { name: string }[];
    };
  };
};
const run = (tok: string, name: string, args: Record<string, unknown> = {}) =>
  rpc(tok, "tools/call", { name, arguments: args });
const agentMemories = async () =>
  (await db.select().from(memories).where(eq(memories.projectId, projectId))).filter(
    (m) => m.source === "agent",
  );

describe("project brain over MCP", () => {
  beforeEach(setup);

  it("offers the new tools only to tokens that may use them", async () => {
    const full = await token(writer, permsWrite);
    const limited = await token(reader, ["read_project", "read_prd"]);
    const names = async (t: string) =>
      (await rpc(t, "tools/list")).result?.tools?.map((x) => x.name);
    expect(await names(full)).toEqual(
      expect.arrayContaining(["get_changes", "read_doc_map", "list_prd_findings", "write_memory"]),
    );
    const small = await names(limited);
    expect(small).toEqual(expect.arrayContaining(["get_changes", "read_doc_map"]));
    expect(small).not.toContain("write_memory");
  });

  it("reports only what changed since the revision the agent already knows", async () => {
    const tok = await token(writer, permsWrite);
    const first = (await run(tok, "get_changes", { sinceRevision: 0 })).result?.structuredContent;
    expect(first?.upToDate).toBe(false);
    expect(first?.changes.length).toBeGreaterThan(0);

    const known = first?.revision as number;
    const same = (await run(tok, "get_changes", { sinceRevision: known })).result
      ?.structuredContent;
    expect(same).toMatchObject({ upToDate: true, changes: [] });

    await createRequirement(owner, slug, {
      group: "features",
      title: "Table QR ordering",
      description: "",
      priority: "medium",
      status: "confirmed",
    });
    const next = (await run(tok, "get_changes", { sinceRevision: known })).result
      ?.structuredContent;
    expect(next?.changes.map((c: { type: string }) => c.type)).toContain("requirement.created");
    expect(next?.changes.every((c: { revision: number }) => c.revision > known)).toBe(true);
  });

  it("serves the document map and the open PRD findings", async () => {
    await db.transaction((tx) =>
      indexDocs(tx, projectId, [{ path: "docs/memory/n.md", content: "# N\n\nbody" }]),
    );
    await createRequirement(owner, slug, {
      group: "features",
      title: "Table QR ordering",
      description: "",
      priority: "medium",
      status: "confirmed",
    });
    for (let i = 0; i < 3; i++) await processProjectChanges(projectId);
    const tok = await token(writer, permsWrite);
    const map = (await run(tok, "read_doc_map")).result?.structuredContent;
    expect(map?.documents.map((d: { path: string }) => d.path)).toContain("docs/memory/n.md");
    const findings = (await run(tok, "list_prd_findings")).result?.structuredContent;
    expect(findings?.findings.map((f: { subject: string }) => f.subject)).toContain(
      "Table QR ordering",
    );
  });

  it("appends memory once, never edits an existing one, and records who did it", async () => {
    const tok = await token(writer, permsWrite);
    const a = (
      await run(tok, "write_memory", { title: "Use idempotency keys", content: "Every POST." })
    ).result?.structuredContent;
    expect(a?.created).toBe(true);
    const again = (
      await run(tok, "write_memory", { title: "use idempotency keys", content: "Every POST." })
    ).result?.structuredContent;
    expect(again).toMatchObject({ created: false, id: a?.id });
    // Same title, new text: appended, the first stays exactly as it was.
    await run(tok, "write_memory", { title: "Use idempotency keys", content: "Also PUT." });
    const rows = await agentMemories();
    expect(rows).toHaveLength(2);
    expect(rows.find((m) => m.id === a?.id)?.content).toBe("Every POST.");

    const audit = await db
      .select()
      .from(toolExecutions)
      .where(eq(toolExecutions.toolName, "write_memory"));
    expect(audit.length).toBeGreaterThanOrEqual(3);
    expect(audit.every((e) => e.agentId === writer.id)).toBe(true);
  });

  it("refuses write_memory without the permission and rejects bad input", async () => {
    const tok = await token(reader, ["read_project", "read_prd", "write_memory"]);
    // The agent itself lacks the permission, whatever the token scopes say.
    const denied = await run(tok, "write_memory", { title: "x y", content: "z" });
    expect(denied.result?.isError).toBe(true);
    expect(await agentMemories()).toHaveLength(0);

    const ok = await token(writer, permsWrite);
    const bad = await run(ok, "write_memory", { title: "x", content: "" });
    expect(bad.result?.isError).toBe(true);
    expect(await agentMemories()).toHaveLength(0);
  });
});
