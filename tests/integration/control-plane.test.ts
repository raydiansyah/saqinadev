import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureAgentConnection } from "@/lib/agents/connections";
import { createHandoff, importResult, previewHandoff } from "@/lib/agents/handoff";
import { assignAgentTx, startRun } from "@/lib/agents/orchestrator";
import { listAgentRegistry } from "@/lib/agents/registry";
import { getRunDetail } from "@/lib/agents/runs";
import {
  createModel,
  createProvider,
  listProviders,
  setDefaults,
  setPolicy,
  setRoleMapping,
  testProvider,
} from "@/lib/ai/control-plane";
import { runAi } from "@/lib/ai/gateway";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  activities,
  agentHandoffs,
  agents,
  aiUsageRecords,
  auditEvents,
  credentials,
  projectSettings,
  toolExecutions,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { connectRepository, getRepository, toRepositoryView } from "@/lib/git/service";
import { completeInterview, saveAnswers } from "@/lib/interviews/service";
import {
  connectMcp,
  createMcpConnection,
  listMcpConnections,
  listProjectTools,
  setToolTrust,
} from "@/lib/mcp/service";
import { createMemory } from "@/lib/memory/service";
import { startProject } from "@/lib/projects/service";
import { projectStackMismatches } from "@/lib/projects/stack";
import { listProposals } from "@/lib/proposals/repository";
import { approveProposal } from "@/lib/proposals/service";
import { createTask } from "@/lib/tasks/service";
import { executeTool } from "@/lib/tools/executor";
import { startDevAiServer } from "../../scripts/dev-ai-server";
import { startDevMcpServer } from "../../scripts/dev-mcp-server";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"]) => {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
};

const AI_KEY = "dev-mock-key-test-1234567890";
const GIT_TOKEN_LOOKALIKE = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
let owner: Actor;
let member: Actor;
let stranger: Actor;
let slug: string;
let otherSlug: string;
let access: ProjectAccess;
let aiServer: Server;
let mcpServer: Server;
let aiBase: string;
let mcpEndpoint: string;
let repoPath: string;
let modelId: string;
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repoPath, ...args], { encoding: "utf8" }).trim();

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  member = await createUser("Member");
  stranger = await createUser("Stranger");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
  slug = await project(member, "Online shop for handmade soap");
  otherSlug = await project(stranger, "Booking site for a barbershop");
  access = await loadProjectAccess(member, { slug }, "project:read");

  aiServer = await startDevAiServer(0, AI_KEY);
  aiBase = `http://127.0.0.1:${(aiServer.address() as AddressInfo).port}/v1`;
  mcpServer = await startDevMcpServer(0);
  mcpEndpoint = `http://127.0.0.1:${(mcpServer.address() as AddressInfo).port}/mcp`;

  repoPath = mkdtempSync(join(tmpdir(), "saqina-repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", repoPath]);
  writeFileSync(
    join(repoPath, "composer.json"),
    JSON.stringify({ require: { "laravel/framework": "^11.0" } }),
  );
  writeFileSync(join(repoPath, "README.md"), "# Soap shop\n");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=t@example.test", "commit", "-q", "-m", "init");
});

afterAll(async () => {
  aiServer?.close();
  mcpServer?.close();
  await resetDatabase();
});

describe("AI control plane", () => {
  it("only lets the platform owner manage providers", async () => {
    await expectCode(
      createProvider(member, {
        name: "Dev",
        type: "custom",
        adapter: "openai_compatible",
        baseUrl: aiBase,
        secret: AI_KEY,
      }),
      "AUTHORIZATION_ERROR",
    );
  });

  it("stores provider secrets encrypted and never returns them", async () => {
    const { id } = await createProvider(owner, {
      name: "Dev mock",
      type: "custom",
      adapter: "openai_compatible",
      baseUrl: aiBase,
      secret: AI_KEY,
    });
    const [cred] = await db.select().from(credentials);
    expect(cred.ciphertext).not.toContain(AI_KEY);
    const listed = JSON.stringify(await listProviders(owner));
    expect(listed).not.toContain(AI_KEY);
    expect(listed).toContain('"hasCredential":true');
    const test = await testProvider(owner, { id });
    expect(test).toMatchObject({ ok: true, code: "ok", models: ["saqina-dev-mock"] });
    const audit = JSON.stringify(await db.select().from(auditEvents));
    expect(audit).not.toContain(AI_KEY);

    const bad = await createProvider(owner, {
      name: "Wrong key",
      type: "custom",
      adapter: "openai_compatible",
      baseUrl: aiBase,
      secret: "wrong-key-123456",
    });
    expect(await testProvider(owner, { id: bad.id })).toMatchObject({
      ok: false,
      code: "auth_failed",
    });

    modelId = (
      await createModel(owner, {
        providerId: id,
        modelId: "saqina-dev-mock",
        displayName: "Dev mock",
        capabilities: ["text", "structured_output", "streaming", "tool_calling", "coding"],
      })
    ).id;
    const broken = await createModel(owner, {
      providerId: bad.id,
      modelId: "saqina-dev-mock",
      displayName: "Broken",
      capabilities: ["text", "structured_output"],
    });
    await setDefaults(owner, { defaultModelId: modelId, fallbackModelId: null });
    await expectCode(
      setDefaults(owner, { defaultModelId: broken.id, fallbackModelId: null }),
      "VALIDATION_ERROR",
    );
  });

  it("rejects agent mappings to models without the needed capability", async () => {
    await expectCode(
      setRoleMapping(owner, {
        role: "qa",
        primaryModelId: modelId,
        fallbackModelId: null,
        requiredCapabilities: ["vision"],
      }),
      "VALIDATION_ERROR",
    );
    await setRoleMapping(owner, {
      role: "backend",
      primaryModelId: modelId,
      fallbackModelId: null,
      requiredCapabilities: ["coding"],
    });
  });

  it("resolves platform default, honours policy and records usage", async () => {
    const out = await runAi({
      access,
      operation: "structured_analysis",
      required: ["text"],
      run: (c) => c.generate({ system: "", segments: [], userMessage: "hi", draft: "hello" }),
    });
    expect(out).toMatchObject({
      source: "platform_default",
      fallbackUsed: false,
      deterministic: false,
    });
    expect(out.value).toContain("[dev mock model] hello");
    const [usage] = await db
      .select()
      .from(aiUsageRecords)
      .where(eq(aiUsageRecords.projectId, access.project.id));
    expect(usage).toMatchObject({ status: "succeeded", operation: "structured_analysis" });

    // A project override is ignored once the Owner disallows it.
    await db
      .insert(projectSettings)
      .values({ projectId: access.project.id, preferredModelId: modelId })
      .onConflictDoUpdate({
        target: projectSettings.projectId,
        set: { preferredModelId: modelId },
      });
    expect((await runAi({ access, operation: "conversation", run: async () => 1 })).source).toBe(
      "project_override",
    );
    await setPolicy(owner, {
      allowedProviderIds: null,
      allowedModelIds: null,
      allowProjectOverride: false,
      allowAgentOverride: true,
      allowExternalProviders: true,
    });
    expect((await runAi({ access, operation: "conversation", run: async () => 1 })).source).toBe(
      "platform_default",
    );

    // Nothing fits the capability: rules answer, and the outcome says so.
    const none = await runAi({
      access,
      operation: "conversation",
      required: ["vision"],
      run: async (c) => c.deterministic,
    });
    expect(none).toMatchObject({ value: true, source: "rules" });
  });
});

describe("tools and MCP", () => {
  it("discovers MCP tools as untrusted, enforces trust, risk approval and idempotency", async () => {
    const { id } = await createMcpConnection(member, slug, {
      name: "Dev MCP",
      serverType: "local_dev",
      endpoint: mcpEndpoint,
    });
    expect(await connectMcp(member, slug, { id })).toMatchObject({ ok: true, tools: 3 });
    const tools = await listProjectTools(access);
    const echo = tools.find((t) => t.name === "echo");
    const note = tools.find((t) => t.name === "write_note");
    expect(echo).toMatchObject({ trust: "discovered", riskLevel: "low" });
    expect(note).toMatchObject({ riskLevel: "high" });

    await expectCode(
      executeTool({
        access,
        tool: "echo",
        input: { text: "hi" },
        actor: { kind: "member" },
        idempotencyKey: "t-echo-1",
      }),
      "AUTHORIZATION_ERROR",
    );
    await setToolTrust(member, slug, { toolId: echo?.id, trust: "enabled" });
    await setToolTrust(member, slug, { toolId: note?.id, trust: "enabled" });
    const ran = await executeTool({
      access,
      tool: "echo",
      input: { text: "hi" },
      actor: { kind: "member" },
      idempotencyKey: "t-echo-2",
    });
    expect(ran).toMatchObject({ status: "succeeded", output: { text: "hi" } });
    const again = await executeTool({
      access,
      tool: "echo",
      input: { text: "hi" },
      actor: { kind: "member" },
      idempotencyKey: "t-echo-2",
    });
    expect(again.executionId).toBe(ran.executionId);
    await expectCode(
      executeTool({
        access,
        tool: "echo",
        input: { nope: 1 },
        actor: { kind: "member" },
        idempotencyKey: "t-echo-3",
      }),
      "VALIDATION_ERROR",
    );

    const pending = await executeTool({
      access,
      tool: "write_note",
      input: { note: "x" },
      actor: { kind: "member" },
      idempotencyKey: "t-note-1",
    });
    expect(pending.status).toBe("pending_approval");
    if (pending.status !== "pending_approval") throw new Error();
    const result = await approveProposal(member, slug, { proposalId: pending.proposalId });
    expect(result.tools[0]).toMatchObject({ status: "succeeded" });
    const [audit] = await db
      .select()
      .from(toolExecutions)
      .where(eq(toolExecutions.idempotencyKey, "t-note-1"));
    expect(audit).toMatchObject({ status: "succeeded", proposalId: pending.proposalId });
  });

  it("keeps MCP connections and tools inside their project", async () => {
    const other = await loadProjectAccess(stranger, { slug: otherSlug }, "project:read");
    expect(await listMcpConnections(other)).toEqual([]);
    const [echo] = (await listProjectTools(access)).filter((t) => t.name === "echo");
    await expectCode(
      executeTool({
        access: other,
        tool: `mcp:${echo.connectionId}:echo`,
        input: { text: "x" },
        actor: { kind: "member" },
        idempotencyKey: "t-x",
      }),
      "NOT_FOUND",
    );
  });

  it("denies tools an agent has no permission for", async () => {
    const [claude] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.projectId, access.project.id), eq(agents.type, "claude")));
    await expectCode(
      executeTool({
        access,
        tool: "read_prd",
        input: {},
        actor: { kind: "agent", agentId: claude.id, name: "No reads", permissions: [] },
        idempotencyKey: "t-agent-1",
      }),
      "AUTHORIZATION_ERROR",
    );
  });
});

describe("repository and agents", () => {
  it("connects a repository without storing or returning the token, and flags a stack mismatch", async () => {
    await expectCode(
      connectRepository(stranger, slug, { provider: "custom_local", fullName: repoPath }),
      "NOT_FOUND",
    );
    await connectRepository(member, slug, {
      provider: "custom_local",
      fullName: repoPath,
      token: GIT_TOKEN_LOOKALIKE,
    });
    const row = await getRepository(access);
    expect(row).toMatchObject({
      status: "connected",
      defaultBranch: "main",
      detectedStack: { backend: "Laravel" },
    });
    expect(JSON.stringify(toRepositoryView(row as never))).not.toContain(GIT_TOKEN_LOOKALIKE);
    const mismatches = await projectStackMismatches(access);
    expect(mismatches.some((m) => m.repository === "Laravel")).toBe(true);
  });

  it("runs a model-planned agent: reads through tools, proposes a branch commit, applies only after approval", async () => {
    const task = await createTask(member, slug, { title: "Implement authentication API" });
    const { agents: team } = await listAgentRegistry(access);
    const backend = team.find((a) => a.role === "backend");
    if (!backend) throw new Error("no backend agent");
    const batch = new EventBatch();
    const { runId } = await db.transaction(async (tx) => {
      const writer = await loadProjectAccess(member, { slug }, "content:write", tx);
      return assignAgentTx(
        tx,
        writer,
        { taskId: task.id, agentId: backend.id, instructions: "" },
        { via: "user" },
        batch,
      );
    });
    batch.flush();
    await startRun(access, runId);
    const detail = await getRunDetail(access, runId);
    expect(detail?.run.status).toBe("waiting");
    expect((detail?.run.output as { model?: { label: string } }).model?.label).toContain(
      "Dev mock",
    );
    const reads = await db
      .select()
      .from(toolExecutions)
      .where(and(eq(toolExecutions.runId, runId), eq(toolExecutions.toolName, "list_files")));
    expect(reads[0]).toMatchObject({ status: "succeeded", source: "git" });

    // Nothing touched the repository before approval.
    expect(git("branch", "--list", "saqina/*")).toBe("");
    const [proposal] = await listProposals(access, { status: ["pending"] });
    expect(proposal.actions.map((a) => a.type)).toEqual(expect.arrayContaining(["RUN_TOOL"]));
    const result = await approveProposal(member, slug, { proposalId: proposal.id });
    expect(result.tools.map((t) => t.status)).toEqual(["succeeded", "succeeded"]);
    const branches = git("branch", "--list", "saqina/*");
    expect(branches).toContain("saqina/implement-authentication-api");
    expect(git("log", "--format=%s", "-1", branches.replace("*", "").trim())).toContain(
      "docs: plan for",
    );
    expect(git("rev-parse", "main")).toBe(git("rev-parse", "main")); // default branch unchanged
    expect(git("log", "--format=%s", "main")).toBe("init");
  });

  it("refuses writes to protected branches even when approved", async () => {
    const pending = await executeTool({
      access,
      tool: "commit_changes",
      input: { branch: "main", message: "x", files: [{ path: "a.txt", content: "x" }] },
      actor: { kind: "member" },
      idempotencyKey: "t-main-1",
    });
    if (pending.status !== "pending_approval") throw new Error("expected approval");
    const result = await approveProposal(member, slug, { proposalId: pending.proposalId });
    expect(result.tools[0]).toMatchObject({ status: "failed", code: "protected" });
    expect(git("log", "--format=%s", "main")).toBe("init");
  });

  it("hands off to an external agent with only authorised, secret-free context", async () => {
    await createMemory(member, slug, {
      title: "Leaked key",
      content: `old key sk-ant-ABCDEFGHIJKLMNOPQRSTUVWX123`,
      category: "technical",
    });
    const [codex] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.projectId, access.project.id), eq(agents.type, "codex")));
    await db
      .update(agents)
      .set({ permissions: ["read_project", "read_tasks", "read_memory"] })
      .where(eq(agents.id, codex.id));
    await configureAgentConnection(member, slug, { agentId: codex.id, strategy: "handoff" });
    const task = await createTask(member, slug, { title: "Build checkout page" });
    const preview = await previewHandoff(member, slug, { agentId: codex.id, taskId: task.id });
    expect(preview.excluded).toEqual(expect.arrayContaining(["PRD.md", "REPOSITORY.md"]));
    const first = await createHandoff(member, slug, {
      agentId: codex.id,
      taskId: task.id,
      idempotencyKey: "handoff-test-1",
    });
    const second = await createHandoff(member, slug, {
      agentId: codex.id,
      taskId: task.id,
      idempotencyKey: "handoff-test-1",
    });
    expect(second.id).toBe(first.id);
    const [row] = await db.select().from(agentHandoffs).where(eq(agentHandoffs.id, first.id));
    expect(row.package).not.toContain("sk-ant-ABCDEFGHIJKLMNOPQRSTUVWX123");
    expect(row.package).not.toContain("PRD.md -->");
    // Creating a handoff is not a content change: the package stays current.
    const fresh = await loadProjectAccess(member, { slug }, "project:read");
    expect(fresh.project.contextRevision).toBe(row.contextVersion);

    const result = await importResult(member, slug, {
      handoffId: first.id,
      raw: '{"status":"completed","summary":"Checkout page built","changes":["pages/checkout.tsx"]}',
    });
    expect(result).toMatchObject({
      summary: "Checkout page built",
      changes: ["pages/checkout.tsx"],
    });
    const text = await importResult(member, slug, { handoffId: first.id, raw: "Done, see PR 12" });
    expect(text).toMatchObject({ summary: "Done, see PR 12", changes: [] });
  });

  it("never writes secrets into activity or audit logs", async () => {
    const dump = JSON.stringify([
      await db.select().from(activities),
      await db.select().from(auditEvents),
      await db.select().from(toolExecutions),
    ]);
    for (const secret of [AI_KEY, GIT_TOKEN_LOOKALIKE, "sk-ant-ABCDEFGHIJKLMNOPQRSTUVWX123"])
      expect(dump).not.toContain(secret);
  });
});
