import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProvider } from "@/lib/ai/provider";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { auditEvents, documents, projects } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { type FileEntry, type GitAdapter, GitError } from "@/lib/git/types";
import { importFromGithub } from "@/lib/imports/service";
import { completeInterview, getInterviewState } from "@/lib/interviews/service";
import { createUser, resetDatabase } from "../helpers/db";

const FILES: Record<string, string> = {
  "README.md":
    "# Restaurant POS\n\nA point of sale for small restaurants with table orders and daily sales reports.\n",
  "PRD.md": "# Product requirements\n\nStaff take orders on tablets.\n",
  "docs/architecture.md": "# Architecture\n\nNext.js app with PostgreSQL.\n",
  "package.json": JSON.stringify({ dependencies: { next: "16", pg: "8", "better-auth": "1" } }),
};

/** A repository in memory. `files` decides what exists; no network is involved. */
function fakeAdapter(files: Record<string, string> = FILES): GitAdapter {
  const fail = async (): Promise<never> => {
    throw new GitError("unsupported");
  };
  return {
    provider: "github",
    getRepository: async (ref) => ({
      fullName: ref.fullName,
      externalId: "1",
      defaultBranch: "main",
      headSha: "abc",
    }),
    listFiles: async (_ref, _token, input) => {
      const dir = input.path ? `${input.path}/` : "";
      return Object.keys(files)
        .filter((p) => p.startsWith(dir) && !p.slice(dir.length).includes("/"))
        .map((p): FileEntry => ({ path: p, type: "file", size: files[p].length }));
    },
    readFile: async (_ref, _token, input) => {
      if (!(input.path in files)) throw new GitError("not_found");
      return files[input.path];
    },
    listBranches: fail,
    searchCode: fail,
    createBranch: fail,
    commitChanges: fail,
    createPullRequest: fail,
  };
}

const aiProvider = (reply: unknown): AiProvider & { calls: number } => {
  const p = {
    calls: 0,
    deterministic: false,
    config: { provider: "mock" as const, model: "test-model" },
    generate: async () => "",
    stream: async function* () {},
    generateObject: async () => {
      p.calls += 1;
      return reply;
    },
  };
  return p as unknown as AiProvider & { calls: number };
};

const AI_REPLY = {
  name: "Kasir Resto",
  description: "Aplikasi kasir untuk restoran kecil dengan pesanan meja.",
  projectType: "pos",
  audience: ["employees"],
  features: ["pos", "reports"],
  platforms: ["web"],
  authMethods: ["email"],
};

describe("import from GitHub", () => {
  let owner: Actor;
  const connect = vi.fn(async () => undefined);
  beforeEach(async () => {
    await resetDatabase();
    owner = await createUser("Owner", "owner@example.test");
    connect.mockClear();
  });

  it("creates a project that lands on review with imported answers, copied docs and a connection", async () => {
    const result = await importFromGithub(
      owner,
      { repo: "https://github.com/acme/restaurant-pos", token: "ghp_secret_value" },
      "en",
      { adapter: fakeAdapter(), connect },
    );
    expect(result).toMatchObject({ documents: 3, usedAi: false, connected: true });

    const state = await getInterviewState(owner, result.slug);
    expect(state.step).toBe("review");
    expect(state.status).toBe("in_progress");
    expect(state.completedSteps).toContain("project");
    expect(state.data.answers.projectState).toBe("existing");
    expect(state.data.answers.ownStack.frontend).toBe("Next.js");
    expect(state.data.answers.ownStack.database).toBe("PostgreSQL");
    // Everything read from the repository is provisional until the user confirms it.
    for (const key of ["projectState", "ownStack", "projectDescription", "versioning"] as const)
      expect(state.data.sources[key], key).toBe("imported");

    const [project] = await db.select().from(projects).where(eq(projects.slug, result.slug));
    expect(project.name).toBe("Restaurant POS");
    const docs = await db.select().from(documents).where(eq(documents.projectId, project.id));
    // The repository's PRD.md is the project's PRD; the other files stay as copied documents.
    expect(docs.map((d) => d.slug).sort()).toEqual([
      "prd",
      "repo-docs-architecture",
      "repo-readme",
    ]);
    const prd = docs.find((d) => d.slug === "prd");
    expect(prd?.type).toBe("prd");
    expect(prd?.content).toContain(
      "Imported from https://github.com/acme/restaurant-pos/blob/main/PRD.md",
    );

    expect(connect).toHaveBeenCalledWith(owner, result.slug, {
      provider: "github",
      fullName: "acme/restaurant-pos",
      token: "ghp_secret_value",
    });
    const audit = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.type, "project.imported"));
    expect(audit).toHaveLength(1);
    // The token is handed to the encrypted connection and appears nowhere else.
    expect(JSON.stringify(audit) + JSON.stringify(docs)).not.toContain("ghp_secret_value");
  });

  it("lets the user finish the interview afterwards without a slug clash with the generated PRD", async () => {
    const { slug } = await importFromGithub(owner, { repo: "acme/restaurant-pos" }, "en", {
      adapter: fakeAdapter(),
      connect,
    });
    await completeInterview(owner, slug);
    const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
    const slugs = (
      await db.select().from(documents).where(eq(documents.projectId, project.id))
    ).map((d) => d.slug);
    // The imported PRD is kept, not replaced by a generated one; the missing plan is generated.
    expect(slugs.filter((x) => x === "prd")).toHaveLength(1);
    expect(slugs).toEqual(expect.arrayContaining(["prd", "plan", "repo-readme"]));
    const prd = (await db.select().from(documents).where(eq(documents.projectId, project.id))).find(
      (d) => d.slug === "prd",
    );
    expect(prd?.content).toContain("Imported from https://github.com/acme/restaurant-pos");
  });

  it("uses the AI only with consent, and only when a real model answers", async () => {
    const declined = aiProvider(AI_REPLY);
    const a = await importFromGithub(owner, { repo: "acme/one", useAi: false }, "en", {
      adapter: fakeAdapter(),
      aiProvider: declined,
      connect,
    });
    expect(a.usedAi).toBe(false);
    expect(declined.calls).toBe(0);

    const allowed = aiProvider(AI_REPLY);
    const b = await importFromGithub(owner, { repo: "acme/two", useAi: true }, "id", {
      adapter: fakeAdapter(),
      aiProvider: allowed,
      connect,
    });
    expect(b.usedAi).toBe(true);
    expect(allowed.calls).toBe(1);
    const [project] = await db.select().from(projects).where(eq(projects.slug, b.slug));
    expect(project.name).toBe("Kasir Resto");
    const state = await getInterviewState(owner, b.slug);
    expect(state.data.answers.features).toEqual(["pos", "reports"]);
    expect(state.data.details.platforms).toEqual(["web"]);
    expect(state.data.sources.details).toBe("imported");
  });

  it("falls back to the rules when the model fails", async () => {
    const broken = aiProvider(null);
    broken.generateObject = async () => {
      throw new Error("model down");
    };
    const result = await importFromGithub(owner, { repo: "acme/three", useAi: true }, "en", {
      adapter: fakeAdapter(),
      aiProvider: broken,
      connect,
    });
    expect(result.usedAi).toBe(false);
    const state = await getInterviewState(owner, result.slug);
    expect(state.data.answers.projectState).toBe("existing");
  });

  it("still succeeds when connecting the repository fails", async () => {
    const result = await importFromGithub(owner, { repo: "acme/four" }, "en", {
      adapter: fakeAdapter(),
      connect: async () => {
        throw new Error("boom");
      },
    });
    expect(result.connected).toBe(false);
    expect(result.documents).toBe(3);
  });

  it("works for a repository without docs, using its name and detected stack", async () => {
    const result = await importFromGithub(owner, { repo: "acme/bare-repo" }, "en", {
      adapter: fakeAdapter({ "package.json": FILES["package.json"] }),
      connect,
    });
    expect(result.documents).toBe(0);
    const [project] = await db.select().from(projects).where(eq(projects.slug, result.slug));
    expect(project.name).toBe("Bare Repo");
  });

  it("reports repository problems by code and creates nothing", async () => {
    const denied: GitAdapter = {
      ...fakeAdapter(),
      getRepository: async () => {
        throw new GitError("auth_failed");
      },
    };
    await expect(
      importFromGithub(owner, { repo: "acme/private" }, "en", { adapter: denied, connect }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { repo: "auth_failed" },
    });
    await expect(
      importFromGithub(owner, { repo: "not a repo" }, "en", { adapter: fakeAdapter(), connect }),
    ).rejects.toMatchObject({
      fields: { repo: "invalid" },
    });
    expect(await db.select().from(projects)).toHaveLength(0);
  });

  it("rate limits repeated imports", async () => {
    const run = () =>
      importFromGithub(owner, { repo: "acme/limited" }, "en", { adapter: fakeAdapter(), connect });
    for (let i = 0; i < 5; i++) await run();
    await expect(run()).rejects.toSatisfy(
      (e: unknown) => e instanceof AppError && e.code === "RATE_LIMIT",
    );
  });
});
