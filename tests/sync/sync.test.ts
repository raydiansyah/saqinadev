import { describe, expect, it } from "vitest";
import { renderAgentsMd } from "@/lib/context/agents-md";
import {
  checkToken,
  createDeployment,
  ensureDomain,
  ensureProject,
  listDeployments,
  VercelError,
  vercelNameFor,
} from "@/lib/deploy/vercel";
import { parseGitEvent } from "@/lib/git/events/parse";
import { branchFor, findTaskRefs, taskRef } from "@/lib/git/task-refs";
import { safeRepoPath } from "@/lib/studio/code";

const ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("task references", () => {
  it("is T- and the first eight characters of the id", () => {
    expect(taskRef(ID)).toBe("T-1a2b3c4d");
  });

  it("finds references in branches, titles and commit messages, once each", () => {
    expect(
      findTaskRefs("saqina/T-1a2b3c4d-checkout", "Saqina-Task: T-1A2B3C4D\nand T-99999999", null),
    ).toEqual(["T-1a2b3c4d", "T-99999999"]);
    expect(findTaskRefs("FOOT-1a2b3c4d", "T-1a2b3c4", "T-1a2b3c4de")).toEqual([]);
  });

  it("builds a safe branch name", () => {
    expect(branchFor("saqina/", ID, "Add Checkout & Payment!")).toBe(
      "saqina/T-1a2b3c4d-add-checkout-payment",
    );
    expect(branchFor("saqina/", ID, "!!!")).toBe("saqina/T-1a2b3c4d");
  });
});

describe("repository events", () => {
  it("reads a pull request", () => {
    expect(
      parseGitEvent("pull_request", {
        action: "closed",
        pull_request: {
          number: 7,
          title: "Checkout",
          body: "Saqina-Task: T-1a2b3c4d",
          html_url: "https://github.com/a/b/pull/7",
          merged: true,
          head: { ref: "saqina/T-1a2b3c4d" },
          base: { ref: "main" },
        },
      }),
    ).toMatchObject({
      kind: "pull_request",
      number: 7,
      merged: true,
      headRef: "saqina/T-1a2b3c4d",
    });
  });

  it("reads CI from a check suite and a workflow run", () => {
    expect(
      parseGitEvent("check_suite", {
        check_suite: {
          id: 5,
          head_sha: "abc",
          head_branch: "main",
          status: "completed",
          conclusion: "success",
          app: { name: "GitHub Actions" },
        },
      }),
    ).toMatchObject({
      kind: "ci",
      externalId: "suite:5",
      conclusion: "success",
      name: "GitHub Actions",
    });
    expect(
      parseGitEvent("workflow_run", {
        workflow_run: {
          id: 9,
          head_sha: "abc",
          head_branch: "main",
          status: "in_progress",
          name: "CI",
          html_url: "https://x",
        },
      }),
    ).toMatchObject({ kind: "ci", externalId: "run:9", status: "in_progress", conclusion: null });
  });

  it("reads a deployment status, telling production from preview", () => {
    const base = { deployment: { id: 3, sha: "abc", environment: "Production" } };
    expect(
      parseGitEvent("deployment_status", {
        ...base,
        deployment_status: { state: "success", environment_url: "https://a.saqina.dev" },
      }),
    ).toMatchObject({
      kind: "deployment",
      environment: "production",
      state: "success",
      url: "https://a.saqina.dev",
    });
    expect(
      parseGitEvent("deployment_status", {
        deployment: { id: 4, environment: "Preview" },
        deployment_status: { state: "error" },
      }),
    ).toMatchObject({ environment: "preview", state: "failure" });
  });

  it("ignores what it does not record, and survives garbage", () => {
    expect(parseGitEvent("issues", {})).toBeNull();
    expect(parseGitEvent("push", { ref: "refs/tags/v1" })).toBeNull();
    expect(parseGitEvent("pull_request", null)).toBeNull();
    expect(
      parseGitEvent("deployment_status", {
        deployment: { id: 1 },
        deployment_status: { state: "weird" },
      }),
    ).toBeNull();
  });
});

describe("repository paths", () => {
  it("refuses anything that climbs out of the repository", () => {
    expect(safeRepoPath("/src/app/")).toBe("src/app");
    expect(() => safeRepoPath("../etc")).toThrow();
    expect(() => safeRepoPath("a/../../b")).toThrow();
  });
});

describe("Vercel client", () => {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fake = (responses: Record<string, { status?: number; body?: unknown }>) =>
    (async (url: URL, init: RequestInit) => {
      calls.push({ url, init });
      const key = `${init.method ?? "GET"} ${url.pathname}`;
      const r = responses[key] ?? { status: 404 };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
    }) as unknown as typeof fetch;
  const ctx = (fetcher: typeof fetch, teamId: string | null = "team_1") => ({
    token: "tok",
    teamId,
    fetcher,
  });

  it("names the project and sends the team and bearer token on every call", async () => {
    calls.length = 0;
    await checkToken(ctx(fake({ "GET /v2/user": { body: {} } })));
    expect(calls[0].url.searchParams.get("teamId")).toBe("team_1");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(vercelNameFor("shop-ab12")).toBe("saqina-shop-ab12");
  });

  it("creates the project from the repository, or finds it when it exists", async () => {
    const created = await ensureProject(
      ctx(fake({ "POST /v11/projects": { body: { id: "prj_1", name: "saqina-x" } } })),
      { name: "saqina-x", repo: "acme/shop" },
    );
    expect(created).toEqual({ id: "prj_1", name: "saqina-x" });
    const found = await ensureProject(
      ctx(
        fake({
          "POST /v11/projects": { status: 409 },
          "GET /v9/projects/saqina-x": { body: { id: "prj_2", name: "saqina-x" } },
        }),
      ),
      { name: "saqina-x", repo: "acme/shop" },
    );
    expect(found.id).toBe("prj_2");
  });

  it("treats an existing domain as done and maps errors to codes", async () => {
    await ensureDomain(
      ctx(fake({ "POST /v10/projects/prj_1/domains": { status: 409 } })),
      "prj_1",
      "a.saqina.dev",
    );
    await expect(checkToken(ctx(fake({ "GET /v2/user": { status: 403 } })))).rejects.toMatchObject({
      code: "auth_failed",
    });
    await expect(checkToken(ctx(fake({ "GET /v2/user": { status: 429 } })))).rejects.toBeInstanceOf(
      VercelError,
    );
  });

  it("reads deployments and starts a production one from the repository", async () => {
    const list = await listDeployments(
      ctx(
        fake({
          "GET /v6/deployments": {
            body: {
              deployments: [
                {
                  uid: "d1",
                  url: "a.vercel.app",
                  state: "READY",
                  target: "production",
                  meta: { githubCommitSha: "abc" },
                },
                { uid: "d2", state: "BUILDING" },
              ],
            },
          },
        }),
      ),
      "prj_1",
    );
    expect(list).toMatchObject([
      {
        id: "d1",
        url: "https://a.vercel.app",
        state: "success",
        environment: "production",
        sha: "abc",
      },
      { id: "d2", state: "pending", environment: "preview" },
    ]);
    calls.length = 0;
    const d = await createDeployment(
      ctx(
        fake({
          "POST /v13/deployments": {
            body: { id: "d3", url: "x.vercel.app", readyState: "QUEUED" },
          },
        }),
      ),
      {
        name: "saqina-x",
        projectId: "prj_1",
        repo: "acme/shop",
        ref: "main",
      },
    );
    expect(d).toMatchObject({ id: "d3", state: "pending", environment: "production" });
    expect(JSON.parse(calls[0].init.body as string).gitSource).toEqual({
      type: "github",
      org: "acme",
      repo: "shop",
      ref: "main",
    });
  });
});

describe("AGENTS.md", () => {
  it("tells the agent the loop, the branch and the skills, and holds no token", () => {
    const md = renderAgentsMd({
      projectName: "Shop",
      mcpEndpoint: "https://www.saqina.dev/api/projects/shop/mcp",
      repository: { fullName: "acme/shop", defaultBranch: "main", branchPrefix: "saqina/" },
      skills: [
        {
          slug: "superpowers-brainstorming",
          name: "Superpowers: brainstorming",
          description: "Think first.",
        },
      ],
      connectors: [{ name: "Exa", tools: ["web_search"] }],
      services: [{ kind: "database", provider: "neon", envVars: ["DATABASE_URL"] }],
    });
    expect(md).toContain("claim_task");
    expect(md).toContain("saqina/T-xxxxxxxx");
    expect(md).toContain("Saqina-Task: T-xxxxxxxx");
    expect(md).toContain("`superpowers-brainstorming`");
    expect(md).toContain("Exa: web_search");
    expect(md).not.toMatch(/sqn_/);
    expect(md).toContain("neon (database): DATABASE_URL");
    expect(md).toContain("process.env");
  });
});
