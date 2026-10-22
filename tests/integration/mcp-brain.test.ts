import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { processProjectChanges } from "@/lib/brain/process";
import { db } from "@/lib/db/client";
import {
  agents,
  memories,
  projects,
  repositoryConnections,
  skillUsages,
  toolExecutions,
} from "@/lib/db/schema";
import { indexDocs } from "@/lib/docmap/index-docs";
import { USER_TRACE } from "@/lib/events/types";
import type { SyncAdapter } from "@/lib/git/types";
import { handleMcpRequest } from "@/lib/mcp/server";
import { createAgentToken } from "@/lib/mcp/tokens";
import { enqueueCodeIndex } from "@/lib/memory/code/schedule";
import { processMemoryJobs } from "@/lib/memory/jobs";
import { approveMemory } from "@/lib/memory/lifecycle";
import { createMemoryTx } from "@/lib/memory/service";
import { createSkill, setSkillVisibility } from "@/lib/memory/skills/service";
import { syncWikiFromDocuments } from "@/lib/memory/wiki/index";
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
    expect(rows.find((m) => m.assetId === a?.id)?.content).toBe("Every POST.");

    const audit = await db
      .select()
      .from(toolExecutions)
      .where(eq(toolExecutions.toolName, "write_memory"));
    expect(audit.length).toBeGreaterThanOrEqual(3);
    expect(audit.every((e) => e.agentId === writer.id)).toBe(true);
  });

  it("keeps agent-written memory out of everyone's reach until a person approves it", async () => {
    const tok = await token(writer, permsWrite);
    const written = (
      await run(tok, "write_memory", { title: "Proposal", content: "zebrafish caching rule" })
    ).result?.structuredContent;
    expect(written).toMatchObject({ created: true, status: "pending_review" });
    // Not searchable and not readable by id, by the agent that wrote it or any other.
    const found = (await run(tok, "search_memory", { query: "zebrafish" })).result
      ?.structuredContent;
    expect(found?.items).toEqual([]);
    expect(found?.semantic).toBe("off");
    expect((await run(tok, "read_memory", { id: written?.id })).result?.isError).toBe(true);

    await approveMemory(owner, slug, { id: written?.id, visibility: "project" });
    const after = (await run(tok, "search_memory", { query: "zebrafish" })).result
      ?.structuredContent;
    expect(after?.items.map((i: { title: string }) => i.title)).toEqual(["Proposal"]);
    const read = (await run(tok, "read_memory", { id: written?.id })).result?.structuredContent;
    expect(read).toMatchObject({
      title: "Proposal",
      content: "zebrafish caching rule",
      confidence: "confirmed",
    });
  });

  it("never hands an agent the private memory of the member who created its token", async () => {
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const secret = await db.transaction((tx) =>
      createMemoryTx(
        tx,
        access,
        {
          title: "Owner diary",
          content: "narwhal private thoughts",
          category: "product",
          importance: "normal",
        },
        USER_TRACE,
        { visibility: "private" },
      ),
    );
    const tok = await token(writer, permsWrite);
    expect(
      (await run(tok, "search_memory", { query: "narwhal" })).result?.structuredContent?.items,
    ).toEqual([]);
    expect((await run(tok, "read_memory", { id: secret.assetId })).result?.isError).toBe(true);
  });

  it("does not reveal someone else's private or rejected memory through write_memory", async () => {
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const secret = await db.transaction((tx) =>
      createMemoryTx(
        tx,
        access,
        {
          title: "Owner secret",
          content: "exact secret text",
          category: "product",
          importance: "normal",
        },
        USER_TRACE,
        { visibility: "private" },
      ),
    );
    const tok = await token(writer, permsWrite);
    const probe = (
      await run(tok, "write_memory", { title: "Owner secret", content: "exact secret text" })
    ).result?.structuredContent;
    // Same answer as for any new text: created, with an id of its own, nothing about the secret.
    expect(probe).toMatchObject({ created: true, status: "pending_review" });
    expect(probe?.id).not.toBe(secret.assetId);
  });

  it("keeps no copy of memory text in the tool audit", async () => {
    const tok = await token(writer, permsWrite);
    await run(tok, "write_memory", { title: "Audit probe", content: "quokka secret text" });
    await run(tok, "search_memory", { query: "quokka" });
    const rows = await db
      .select()
      .from(toolExecutions)
      .where(eq(toolExecutions.agentId, writer.id));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(rows.map((r) => [r.input, r.output]))).not.toContain("quokka");
  });

  it("serves cited passages of the project documents, only to tokens that may read the PRD", async () => {
    await syncWikiFromDocuments(projectId);
    const tok = await token(writer, permsWrite);
    const found = (await run(tok, "search_wiki", { query: "restaurant orders" })).result
      ?.structuredContent;
    expect(found?.semantic).toBe("off");
    expect(found?.passages.length).toBeGreaterThan(0);
    expect(found?.passages[0]).toMatchObject({ source: "prd", stale: false });
    expect(found?.passages[0].citation).toMatch(/^prd.*lines \d+-\d+$/);
    const none = (await run(tok, "search_wiki", { query: "quantum entanglement" })).result
      ?.structuredContent;
    expect(none?.passages).toEqual([]);
    // An agent that may not read the PRD is refused, whatever the token says.
    const denied = await token(reader, ["read_project"]);
    expect((await run(denied, "search_wiki", { query: "orders" })).result?.isError).toBe(true);
  });

  it("serves approved skills to agents and takes their feedback, never a private one", async () => {
    const mine = {
      name: "Prepare a deployment checklist",
      description: "Builds the checklist a release needs before it goes live.",
      triggers: ["a release is about to ship"],
      steps: [
        { title: "List what changed", detail: "Read the merged pull requests." },
        { title: "Check migrations", detail: "Confirm each one is reversible." },
      ],
      validation: ["every item has an owner"],
    };
    const shared = await createSkill(owner, slug, mine);
    const secret = await createSkill(owner, slug, { ...mine, name: "Private deployment notes" });
    await setSkillVisibility(owner, slug, { id: shared, visibility: "project" });
    const tok = await token(writer, permsWrite);
    const found = (await run(tok, "search_skills", { query: "deployment release" })).result
      ?.structuredContent;
    expect(found?.skills.map((x: { name: string }) => x.name)).toEqual([
      "Prepare a deployment checklist",
    ]);
    expect(found?.skills[0]).toMatchObject({ useWhen: ["a release is about to ship"] });
    expect(found?.skills.map((x: { id: string }) => x.id)).not.toContain(secret);

    // An agent that was never given a skill cannot report on it.
    const unseen = await createSkill(owner, slug, { ...mine, name: "Rarely offered routine" });
    await setSkillVisibility(owner, slug, { id: unseen, visibility: "project" });
    expect(
      (await run(tok, "record_skill_outcome", { skillId: unseen, outcome: "failure" })).result
        ?.isError,
    ).toBe(true);

    const ok = await run(tok, "record_skill_outcome", {
      skillId: shared,
      outcome: "success",
      note: "worked",
    });
    expect(ok.result?.structuredContent).toMatchObject({ recorded: true });
    expect(
      (await run(tok, "record_skill_outcome", { skillId: secret, outcome: "success" })).result
        ?.isError,
    ).toBe(true);
    const readOnly = await token(reader, ["read_project", "read_prd", "write_memory"]);
    expect(
      (await run(readOnly, "record_skill_outcome", { skillId: shared, outcome: "failure" })).result
        ?.isError,
    ).toBe(true);
    expect((await db.select().from(skillUsages)).map((u) => [u.agentId, u.outcome])).toEqual([
      [writer.id, "success"],
    ]);
  });

  it("serves the code graph to agents allowed to read the repository, with its revision and caveats", async () => {
    const files: Record<string, string> = {
      "src/a.ts": 'import { helper } from "./b";\nexport function run() { helper(); }\n',
      "src/b.ts": "export function helper() {}\n",
    };
    const fake = {
      provider: "github",
      getRepository: async () => ({
        fullName: "acme/shop",
        externalId: null,
        defaultBranch: "main",
        headSha: "abc12345",
      }),
      listBranches: async () => [{ name: "main", sha: "abc12345" }],
      getTree: async () =>
        Object.entries(files).map(([path, text]) => ({
          path,
          size: text.length,
          sha: `s${text.length}`,
        })),
      readFile: async (_r: unknown, _t: unknown, i: { path: string }) => files[i.path],
    } as unknown as SyncAdapter;
    await db.insert(repositoryConnections).values({
      projectId,
      provider: "github",
      fullName: "acme/shop",
      status: "connected",
      headSha: "abc12345",
    });
    await enqueueCodeIndex(db, { projectId, key: "mcp" });
    await processMemoryJobs({ codeAdapter: fake });

    const [coder] = await db
      .insert(agents)
      .values({
        projectId,
        name: "Coder",
        type: "claude",
        provider: "anthropic",
        permissions: ["read_repository"],
      })
      .returning();
    const tok = await token(coder, ["read_repository"]);
    const sym = (await run(tok, "find_symbol", { query: "helper" })).result?.structuredContent;
    expect(sym?.revision).toMatchObject({ branch: "main", commit: "abc12345", stale: false });
    expect(sym?.note).toContain("Static analysis");
    expect(sym?.symbols[0]).toMatchObject({ name: "helper", file: "src/b.ts", lines: [1, 1] });
    const callers = (await run(tok, "find_callers", { symbolId: sym?.symbols[0].id })).result
      ?.structuredContent;
    expect(callers?.callers[0]).toMatchObject({
      resolution: "resolved",
      file: "src/a.ts",
      caller: "run",
    });
    const impact = (await run(tok, "file_impact", { path: "src/b.ts" })).result?.structuredContent;
    expect(impact?.dependents).toEqual([{ path: "src/a.ts", depth: 1, isTest: false }]);
    expect((await run(tok, "file_impact", { path: "src/none.ts" })).result?.isError).toBe(true);

    // An agent without the permission is refused, whatever the token says.
    const denied = await token(reader, ["read_project", "read_repository"]);
    expect((await run(denied, "find_symbol", { query: "helper" })).result?.isError).toBe(true);
  });

  it("caps how many proposals one agent can leave waiting", async () => {
    const tok = await token(writer, permsWrite);
    let last = await run(tok, "write_memory", { title: "Proposal 0", content: "text 0" });
    for (let i = 1; i < 21; i++)
      last = await run(tok, "write_memory", { title: `Proposal ${i}`, content: `text ${i}` });
    expect(last.result?.isError).toBe(true);
    expect(await agentMemories()).toHaveLength(20);
  });

  it("refuses read_memory to an agent without the permission", async () => {
    const tok = await token(reader, ["read_project", "read_prd", "read_memory"]);
    expect(
      (await run(tok, "read_memory", { id: "00000000-0000-4000-8000-000000000000" })).result
        ?.isError,
    ).toBe(true);
    expect((await run(tok, "search_memory", { query: "x" })).result?.isError).toBe(true);
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
