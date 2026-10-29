import { createHmac, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureTeamAgents } from "@/lib/agents/registry";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  agents,
  ciRuns,
  credentials,
  deployments,
  deployTargets,
  projectMembers,
  projects,
  repositoryConnections,
  taskLinks,
  tasks,
} from "@/lib/db/schema";
import { deliveryEvidence } from "@/lib/delivery/evidence";
import {
  publish,
  refreshDeployments,
  removeDeployTarget,
  setupDeployTarget,
} from "@/lib/deploy/service";
import { configureDocSync } from "@/lib/docsync/config";
import { handleGithubWebhook } from "@/lib/docsync/webhook";
import { AppError } from "@/lib/errors";
import { enableRepositoryEvents } from "@/lib/git/hooks";
import { taskRef } from "@/lib/git/task-refs";
import { GitError } from "@/lib/git/types";
import { handleMcpRequest } from "@/lib/mcp/server";
import { createAgentToken } from "@/lib/mcp/tokens";
import { getGitState } from "@/lib/studio/git-state";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"]) => {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
};

let owner: Actor;
let viewer: Actor;
let stranger: Actor;
let slug: string;
let projectId: string;
let connectionId: string;
let secret: string;
let taskA: { id: string; status: string };
let taskB: { id: string; status: string };

const noop = { schedule: () => {} };

const send = (event: string, payload: unknown, opts: { key?: string; delivery?: string } = {}) => {
  const body = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", opts.key ?? secret)
    .update(body)
    .digest("hex")}`;
  return handleGithubWebhook(
    new Request("https://saqina.dev/hook", {
      method: "POST",
      body,
      headers: {
        "x-github-event": event,
        "x-github-delivery": opts.delivery ?? randomUUID(),
        "x-hub-signature-256": signature,
      },
    }),
    connectionId,
    noop,
  );
};
const taskNow = async (id: string) => (await db.select().from(tasks).where(eq(tasks.id, id)))[0];
const pr = (action: string, task: { id: string }, over: Record<string, unknown> = {}) => ({
  action,
  pull_request: {
    number: 7,
    title: "Checkout",
    body: `Saqina-Task: ${taskRef(task.id)}`,
    html_url: "https://github.com/acme/shop/pull/7",
    merged: false,
    head: { ref: `saqina/${taskRef(task.id)}-checkout` },
    base: { ref: "main" },
    ...over,
  },
});

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  viewer = await createUser("Viewer");
  stranger = await createUser("Stranger");
  slug = await project(owner, "Online shop for handmade soap");
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
  projectId = p.id;
  await db.insert(projectMembers).values({ projectId, userId: viewer.id, role: "viewer" });
  const [c] = await db
    .insert(repositoryConnections)
    .values({
      projectId,
      provider: "github",
      fullName: "acme/shop",
      status: "connected",
      createdBy: owner.id,
    })
    .returning();
  connectionId = c.id;
  secret = (await configureDocSync(owner, slug, { enabled: true })).webhookSecret as string;
  const open = await db.select().from(tasks).where(eq(tasks.projectId, projectId));
  await db.update(tasks).set({ status: "todo" }).where(eq(tasks.projectId, projectId));
  taskA = open[0];
  taskB = open[1];
  await db.update(tasks).set({ status: "todo" }).where(eq(tasks.id, taskA.id));
});

describe("repository events move tasks", () => {
  it("rejects a bad signature", async () => {
    expect((await send("pull_request", pr("opened", taskA), { key: "wrong" })).status).toBe(401);
  });

  it("a pull request opened for a task puts it in review and links it", async () => {
    const res = await send("pull_request", pr("opened", taskA));
    expect(await res.json()).toMatchObject({ ok: true, moved: 1, linked: 1 });
    expect((await taskNow(taskA.id)).status).toBe("review");
    const links = await db.select().from(taskLinks).where(eq(taskLinks.taskId, taskA.id));
    expect(links.map((l) => `${l.kind}:${l.ref}:${l.state}`).sort()).toEqual([
      `branch:saqina/${taskRef(taskA.id)}-checkout:null`,
      "pr:7:open",
    ]);
  });

  it("the same delivery twice changes nothing the second time", async () => {
    const delivery = randomUUID();
    await send("pull_request", pr("synchronize", taskA), { delivery });
    expect(
      await (await send("pull_request", pr("synchronize", taskA), { delivery })).json(),
    ).toMatchObject({ duplicate: true });
  });

  it("merging completes the task; closing without merging only records it", async () => {
    await send("pull_request", pr("closed", taskA, { merged: true }));
    const done = await taskNow(taskA.id);
    expect(done.status).toBe("done");
    expect(done.completedAt).not.toBeNull();
    await db.update(tasks).set({ status: "in_progress" }).where(eq(tasks.id, taskB.id));
    await send(
      "pull_request",
      pr("closed", taskB, { number: 8, html_url: "https://github.com/acme/shop/pull/8" }),
    );
    expect((await taskNow(taskB.id)).status).toBe("in_progress");
    const [closed] = await db
      .select()
      .from(taskLinks)
      .where(and(eq(taskLinks.taskId, taskB.id), eq(taskLinks.kind, "pr")));
    expect(closed.state).toBe("closed");
  });

  it("a pull request that names no task of this project is ignored", async () => {
    const res = await send(
      "pull_request",
      pr("opened", { id: "ffffffff-0000-4000-8000-000000000000" }),
    );
    expect(await res.json()).toMatchObject({ linked: 0, moved: 0 });
  });

  it("stores CI runs and deployments, and updates them in place", async () => {
    const suite = (status: string, conclusion: string | null) => ({
      check_suite: {
        id: 11,
        head_sha: "abc1234def",
        head_branch: "main",
        status,
        conclusion,
        app: { name: "GitHub Actions" },
      },
    });
    await send("check_suite", suite("in_progress", null));
    await send("check_suite", suite("completed", "success"));
    const runs = await db.select().from(ciRuns).where(eq(ciRuns.projectId, projectId));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "completed", conclusion: "success", branch: "main" });

    const deploy = (state: string) => ({
      deployment: { id: 99, sha: "abc1234def", environment: "Production" },
      deployment_status: { state, environment_url: "https://shop.saqina.dev" },
    });
    await send("deployment_status", deploy("pending"));
    await send("deployment_status", deploy("success"));
    const rows = await db.select().from(deployments).where(eq(deployments.projectId, projectId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      state: "success",
      environment: "production",
      url: "https://shop.saqina.dev",
    });
  });

  it("a push to the default branch records its head; other events are acknowledged", async () => {
    await send("push", {
      ref: "refs/heads/main",
      after: "f".repeat(40),
      commits: [
        {
          id: "c".repeat(40),
          message: `fix ${taskRef(taskB.id)}`,
          added: [],
          modified: [],
          removed: [],
        },
      ],
    });
    const [conn] = await db
      .select()
      .from(repositoryConnections)
      .where(eq(repositoryConnections.id, connectionId));
    expect(conn.headSha).toBe("f".repeat(40));
    const commit = await db
      .select()
      .from(taskLinks)
      .where(and(eq(taskLinks.taskId, taskB.id), eq(taskLinks.kind, "commit")));
    expect(commit).toHaveLength(1);
    expect(await (await send("issues", {})).json()).toMatchObject({ ignored: "issues" });
  });

  it("shows what happened to members, as delivery suggestions a person confirms", async () => {
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const evidence = await deliveryEvidence(access);
    expect(evidence.map((e) => e.code).sort()).toEqual(["ci_green", "deployed", "pr_merged"]);
    const git = await getGitState(access);
    expect(git.repository?.eventsOn).toBe(true);
    expect(git.links.some((l) => l.kind === "pr" && l.state === "merged")).toBe(true);
    expect(git.ci[0].name).toBe("GitHub Actions");
    // A stranger cannot read any of it.
    await expectCode(loadProjectAccess(stranger, { slug }, "project:read"), "NOT_FOUND");
  });
});

describe("turning events on", () => {
  it("installs the webhook with the project's own token and keeps the secret to itself", async () => {
    const seen: { url: string; secret: string }[] = [];
    const result = await enableRepositoryEvents(owner, slug, {
      install: async (_ref, _token, input) => {
        seen.push(input);
        return { id: 1 };
      },
    });
    expect(result).toEqual({
      installed: true,
      webhookUrl: expect.stringContaining(`/api/git/webhook/${connectionId}`),
    });
    expect(seen[0].secret).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result)).not.toContain(seen[0].secret);
    // The stored secret is the one GitHub was given.
    const sig = createHmac("sha256", seen[0].secret).update("{}").digest("hex");
    expect(sig).toBeTruthy();
    secret = seen[0].secret;
    expect((await send("ping", {})).status).toBe(200);
  });

  it("falls back to the manual setup when the token has no admin rights", async () => {
    const result = await enableRepositoryEvents(owner, slug, {
      install: async () => {
        throw new GitError("auth_failed");
      },
    });
    expect(result).toMatchObject({
      installed: false,
      reason: "no_admin",
      webhookSecret: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    secret = result.webhookSecret as string;
  });

  it("is for project admins only", async () => {
    await expectCode(enableRepositoryEvents(viewer, slug), "AUTHORIZATION_ERROR");
    await expectCode(enableRepositoryEvents(stranger, slug), "NOT_FOUND");
  });
});

describe("publishing", () => {
  const SAQINA_ENV = {
    VERCEL_TOKEN: "saqina-token",
    VERCEL_TEAM_ID: "team_saqina",
    SAQINA_PROJECTS_DOMAIN: "saqina.dev",
  };
  const calls: { url: URL; auth: string }[] = [];
  const fakeVercel = (async (url: URL, init: RequestInit) => {
    calls.push({ url, auth: (init.headers as Record<string, string>).authorization });
    const key = `${init.method ?? "GET"} ${url.pathname}`;
    const body = (<Record<string, Record<string, unknown>>>{
      "GET /v2/user": {},
      "POST /v11/projects": { id: "prj_1", name: "saqina-x" },
      "POST /v10/projects/prj_1/domains": {},
      "POST /v13/deployments": { id: "dep_1", url: "x.vercel.app", readyState: "QUEUED" },
      "GET /v6/deployments": {
        deployments: [{ uid: "dep_1", url: "x.vercel.app", state: "READY", target: "production" }],
      },
    })[key];
    return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 });
  }) as unknown as typeof fetch;
  const deps = { fetcher: fakeVercel, env: SAQINA_ENV };

  it("needs Saqina's Vercel to be set up, and a connected repository", async () => {
    await expectCode(
      setupDeployTarget(owner, slug, { owner: "saqina" }, { env: {} }),
      "VALIDATION_ERROR",
    );
    await db
      .update(repositoryConnections)
      .set({ status: "disconnected" })
      .where(eq(repositoryConnections.id, connectionId));
    await expectCode(publish(owner, slug, deps), "VALIDATION_ERROR");
    await db
      .update(repositoryConnections)
      .set({ status: "connected" })
      .where(eq(repositoryConnections.id, connectionId));
  });

  it("publishes to <slug>.saqina.dev through Saqina's team by default", async () => {
    calls.length = 0;
    const result = await publish(owner, slug, deps);
    expect(result.domain).toBe(`${slug}.saqina.dev`);
    expect(calls.every((c) => c.auth === "Bearer saqina-token")).toBe(true);
    expect(calls.every((c) => c.url.searchParams.get("teamId") === "team_saqina")).toBe(true);
    const [target] = await db
      .select()
      .from(deployTargets)
      .where(eq(deployTargets.projectId, projectId));
    expect(target).toMatchObject({
      owner: "saqina",
      status: "ready",
      vercelProjectId: "prj_1",
      domain: `${slug}.saqina.dev`,
    });
    const rows = await db
      .select()
      .from(deployments)
      .where(and(eq(deployments.projectId, projectId), eq(deployments.provider, "vercel")));
    expect(rows[0]).toMatchObject({ externalId: "dep_1", environment: "production" });
  });

  it("refresh brings the state up to date", async () => {
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    expect(await refreshDeployments(access, deps)).toBe(1);
    const [row] = await db
      .select()
      .from(deployments)
      .where(and(eq(deployments.projectId, projectId), eq(deployments.externalId, "dep_1")));
    expect(row.state).toBe("success");
  });

  it("the client's own Vercel keeps its token encrypted and never uses Saqina's", async () => {
    await setupDeployTarget(
      owner,
      slug,
      {
        owner: "client",
        token: "client-token-123",
        teamId: "team_client",
        domain: "app.client.example",
      },
      deps,
    );
    const [cred] = await db.select().from(credentials).where(eq(credentials.kind, "deploy"));
    expect(cred.ciphertext).not.toContain("client-token-123");
    expect(cred.scope).toBe("project");
    calls.length = 0;
    const result = await publish(owner, slug, deps);
    expect(result.domain).toBe("app.client.example");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.auth === "Bearer client-token-123")).toBe(true);
    expect(calls.every((c) => c.url.searchParams.get("teamId") === "team_client")).toBe(true);
  });

  it("refuses a custom domain on Saqina's Vercel, an invalid domain, and a client without a token", async () => {
    await expectCode(
      setupDeployTarget(owner, slug, { owner: "saqina", domain: "other.example.com" }, deps),
      "VALIDATION_ERROR",
    );
    await expectCode(
      setupDeployTarget(
        owner,
        slug,
        { owner: "client", token: "x-token-123", domain: "not a domain" },
        deps,
      ),
      "VALIDATION_ERROR",
    );
    await removeDeployTarget(owner, slug);
    await expectCode(setupDeployTarget(owner, slug, { owner: "client" }, deps), "VALIDATION_ERROR");
  });

  it("is for project admins only; a stranger gets NOT_FOUND", async () => {
    await expectCode(publish(viewer, slug, deps), "AUTHORIZATION_ERROR");
    await expectCode(publish(stranger, slug, deps), "NOT_FOUND");
    await expectCode(
      setupDeployTarget(viewer, slug, { owner: "saqina" }, deps),
      "AUTHORIZATION_ERROR",
    );
  });
});

describe("a local IDE agent over MCP", () => {
  let token: string;
  let readOnly: string;
  let rpcId = 0;
  const rpc = async (tok: string, method: string, params: Record<string, unknown> = {}) =>
    (await (
      await handleMcpRequest(
        new Request(`https://saqina.dev/api/projects/${slug}/mcp`, {
          method: "POST",
          headers: { authorization: `Bearer ${tok}` },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
        }),
        slug,
      )
    ).json()) as { result?: Record<string, any>; error?: { code: number; message: string } };
  const tool = (tok: string, name: string, args: Record<string, unknown> = {}) =>
    rpc(tok, "tools/call", { name, arguments: args });
  let target: { id: string; title: string };

  beforeAll(async () => {
    await ensureTeamAgents(db, projectId);
    const [agent] = await db
      .insert(agents)
      .values({
        projectId,
        name: "My IDE",
        type: "claude",
        provider: "anthropic",
        permissions: ["read_project", "read_prd", "read_tasks", "write_tasks", "use_mcp_tools"],
      })
      .returning();
    const [reader] = await db
      .insert(agents)
      .values({
        projectId,
        name: "Reader",
        type: "codex",
        provider: "openai",
        permissions: ["read_project", "read_tasks"],
      })
      .returning();
    token = (
      await createAgentToken(owner, slug, {
        label: "ide",
        agentId: agent.id,
        scopes: ["read_project", "read_prd", "read_tasks", "write_tasks", "use_mcp_tools"],
      })
    ).token;
    readOnly = (
      await createAgentToken(owner, slug, {
        label: "ro",
        agentId: reader.id,
        scopes: ["read_project", "read_tasks"],
      })
    ).token;
    const [t] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.status, "todo")));
    await db.update(tasks).set({ status: "todo" }).where(eq(tasks.id, t.id));
    target = t;
  });

  it("lists tasks with their references and reads one with its links", async () => {
    const list = await tool(token, "list_tasks", { status: "todo" });
    expect(
      list.result?.structuredContent?.tasks.some(
        (t: { ref: string }) => t.ref === taskRef(target.id),
      ),
    ).toBe(true);
    const one = await tool(token, "read_task", { task: taskRef(target.id) });
    expect(one.result?.structuredContent).toMatchObject({ ref: taskRef(target.id), id: target.id });
    expect((await tool(token, "read_task", { task: "T-00000000" })).result?.isError).toBe(true);
  });

  it("claims a task once, and reports review with its pull request", async () => {
    const first = await tool(token, "claim_task", { task: taskRef(target.id) });
    expect(first.result?.structuredContent).toMatchObject({ claimed: true, status: "in_progress" });
    expect(first.result?.structuredContent?.branch).toMatch(
      new RegExp(`^saqina/${taskRef(target.id)}`),
    );
    expect(
      (await tool(token, "claim_task", { task: taskRef(target.id) })).result?.structuredContent,
    ).toMatchObject({ claimed: false });

    const report = await tool(token, "report_task_result", {
      task: taskRef(target.id),
      status: "review",
      summary: "Done, please check.",
      pullRequestUrl: "https://github.com/acme/shop/pull/21",
    });
    expect(report.result?.structuredContent).toMatchObject({ status: "review" });
    expect((await taskNow(target.id)).status).toBe("review");
    const links = await db.select().from(taskLinks).where(eq(taskLinks.taskId, target.id));
    expect(links.some((l) => l.kind === "pr" && l.ref === "21")).toBe(true);
  });

  it("can never mark a task done", async () => {
    const res = await tool(token, "report_task_result", {
      task: taskRef(target.id),
      status: "done",
      summary: "x",
    });
    expect(res.result?.isError).toBe(true);
    expect((await taskNow(target.id)).status).toBe("review");
  });

  it("a token without write_tasks neither sees nor runs the write tools", async () => {
    const names = ((await rpc(readOnly, "tools/list")).result?.tools as { name: string }[]).map(
      (t) => t.name,
    );
    expect(names).toContain("list_tasks");
    expect(names).not.toContain("claim_task");
    expect(names).not.toContain("call_connector_tool");
    expect((await tool(readOnly, "claim_task", { task: taskRef(target.id) })).result?.isError).toBe(
      true,
    );
  });

  it("serves skills, AGENTS.md and context as resources, and tools for skills and connectors", async () => {
    const skill = await tool(token, "get_skill", { slug: "superpowers-brainstorming" });
    expect(skill.result?.structuredContent?.content).toContain("Brainstorming");
    expect((await tool(token, "list_connector_tools")).result?.structuredContent?.tools).toEqual(
      [],
    );
    expect((await tool(token, "get_setup")).result?.structuredContent?.agentsMd).toContain(
      "claim_task",
    );

    const list = (await rpc(token, "resources/list")).result?.resources as { uri: string }[];
    expect(list.map((r) => r.uri)).toEqual(
      expect.arrayContaining([
        "saqina://agents/AGENTS.md",
        "saqina://skills/superpowers-writing-plans",
        "saqina://context/PRD.md",
      ]),
    );
    const md = await rpc(token, "resources/read", { uri: "saqina://agents/AGENTS.md" });
    expect(md.result?.contents[0].text).toContain("Saqina Dev");
    // The read-only token has no read_prd: the PRD is not offered to it.
    const roList = (await rpc(readOnly, "resources/list")).result?.resources as { uri: string }[];
    expect(roList.some((r) => r.uri === "saqina://context/PRD.md")).toBe(false);
    expect(
      (await rpc(readOnly, "resources/read", { uri: "saqina://context/PRD.md" })).error,
    ).toBeTruthy();
    expect(
      (await rpc(token, "resources/read", { uri: "saqina://context/../x" })).error,
    ).toBeTruthy();
  });
});
