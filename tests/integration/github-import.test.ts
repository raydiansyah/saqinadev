import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProvider } from "@/lib/ai/provider";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { auditEvents, documents, projects } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { type FileEntry, type GitAdapter, GitError } from "@/lib/git/types";
import { choosePrd, createPrdFromText, listPrdCandidates } from "@/lib/imports/choose-prd";
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
    // The repository already says what the interview would ask: the workspace is ready.
    expect(result.completed).toBe(true);
    expect(state.status).toBe("completed");
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
    // The plan was not in the repository, and nothing is generated in its place.
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
    // The imported PRD is kept, and no plan is generated: documents come from the repository only.
    expect(slugs.filter((x) => x === "prd")).toHaveLength(1);
    expect(slugs).toEqual(expect.arrayContaining(["prd", "repo-readme"]));
    expect(slugs).not.toContain("plan");
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
    // One call reads the answers, one tells the documents apart (the plan and tasks are missing).
    expect(allowed.calls).toBe(2);
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

describe("import from GitHub: the documentation folder", () => {
  let owner: Actor;
  const connect = vi.fn(async () => undefined);
  beforeEach(async () => {
    await resetDatabase();
    owner = await createUser("Owner", "owner@example.test");
  });

  const docsOf = async (slug: string) => {
    const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
    return db.select().from(documents).where(eq(documents.projectId, project.id));
  };

  it("shows everything in docs to the client, and keeps the rest internal", async () => {
    const { slug } = await importFromGithub(owner, { repo: "acme/shop" }, "en", {
      adapter: fakeAdapter({
        ...FILES,
        "docs/security-model.md": "# Security model\n\nHow sessions are protected.\n",
        "docs/runbook.md": "# Runbook\n\nSteps to deploy.\n",
        "docs/keys.md": `# Keys\n\nUse AKIA${"A".repeat(16)} for backups.\n`,
      }),
      connect,
    });
    const docs = await docsOf(slug);
    const bySlug = new Map(docs.map((d) => [d.slug, d]));
    // A file name that looks like noise at the top level is still read inside docs.
    for (const s of ["repo-docs-security-model", "repo-docs-runbook", "repo-docs-architecture"]) {
      expect(bySlug.get(s)?.clientVisible, s).toBe(true);
      expect(bySlug.get(s)?.status, s).toBe("approved");
    }
    // A text that looks like a secret is imported but never shown to the client.
    expect(bySlug.get("repo-docs-keys")?.clientVisible).toBe(false);
    // Files outside the folder stay internal.
    expect(bySlug.get("repo-readme")?.clientVisible).toBe(false);
  });

  it("reads another folder when one is named, and rejects an unsafe one", async () => {
    const files = {
      ...FILES,
      "documentation/product/vision.md": "# Vision\n\nWhere this goes.\n",
    };
    const { slug } = await importFromGithub(
      owner,
      { repo: "acme/shop", docsPath: "documentation/product" },
      "en",
      { adapter: fakeAdapter(files), connect },
    );
    const vision = (await docsOf(slug)).find((d) => d.slug === "repo-documentation-product-vision");
    expect(vision?.clientVisible).toBe(true);
    await expect(
      importFromGithub(owner, { repo: "acme/shop", docsPath: "../etc" }, "en", {
        adapter: fakeAdapter(),
        connect,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

/** A repository with real folders: listing a path returns its files and its subfolders. */
function treeAdapter(files: Record<string, string>): GitAdapter {
  const base = fakeAdapter(files);
  return {
    ...base,
    listFiles: async (_ref, _token, input) => {
      const dir = input.path ? `${input.path}/` : "";
      const seen = new Map<string, FileEntry>();
      for (const p of Object.keys(files)) {
        if (!p.startsWith(dir)) continue;
        const rest = p.slice(dir.length);
        const [head, ...tail] = rest.split("/");
        if (tail.length === 0) seen.set(p, { path: p, type: "file", size: files[p].length });
        else seen.set(`${dir}${head}`, { path: `${dir}${head}`, type: "dir" });
      }
      return [...seen.values()];
    },
  };
}

describe("import from GitHub: finding the PRD in a nested docs folder", () => {
  let owner: Actor;
  const connect = vi.fn(async () => undefined);
  beforeEach(async () => {
    await resetDatabase();
    owner = await createUser("Owner", "owner@example.test");
  });

  it("adopts docs/specifications/prd.md as the project's PRD", async () => {
    const result = await importFromGithub(owner, { repo: "acme/learning" }, "en", {
      adapter: treeAdapter({
        "README.md": "# Learning\n\nAn LMS for a training company with courses and quizzes.\n",
        "docs/README.md": "# Docs\n\nIndex.\n",
        "docs/demo-client.md": "# Demo client\n\nHow to demo.\n",
        "docs/specifications/prd.md": "# PRD\n\n## Goals\n\nTeach people online.\n",
        "docs/sdlc/phases.md": "# SDLC\n\nPhases.\n",
        "package.json": FILES["package.json"],
      }),
      connect,
    });
    expect(result.adopted.prd).toBe(true);
    const [project] = await db.select().from(projects).where(eq(projects.slug, result.slug));
    const prd = (await db.select().from(documents).where(eq(documents.projectId, project.id))).find(
      (d) => d.slug === "prd",
    );
    expect(prd?.content).toContain("docs/specifications/prd.md");
  });
});

describe("import from GitHub: asking where the PRD is", () => {
  let owner: Actor;
  let stranger: Actor;
  const connect = vi.fn(async () => undefined);
  beforeEach(async () => {
    await resetDatabase();
    owner = await createUser("Owner", "owner@example.test");
    stranger = await createUser("Stranger", "stranger@example.test");
  });

  const importWithoutPrd = () =>
    importFromGithub(owner, { repo: "acme/learning" }, "en", {
      adapter: treeAdapter({
        "README.md": "# Learning\n\nAn LMS for a training company with courses and quizzes.\n",
        "docs/handbook/vision.md": "# Vision\n\nWhere the product goes.\n",
        "docs/handbook/notes.md": "# Notes\n\nMeeting notes.\n",
        "package.json": FILES["package.json"],
      }),
      connect,
    });

  it("reports no PRD, lists the documents, and lets the person choose one", async () => {
    const result = await importWithoutPrd();
    expect(result.adopted.prd).toBe(false);
    const access = await loadProjectAccess(owner, { slug: result.slug }, "content:write");
    const candidates = await listPrdCandidates(access);
    expect(candidates.map((c) => c.path)).toContain("docs/handbook/vision.md");

    await choosePrd(owner, result.slug, { docSlug: "repo-docs-handbook-vision" });
    const prd = (
      await db.select().from(documents).where(eq(documents.projectId, access.project.id))
    ).find((d) => d.slug === "prd");
    expect(prd?.type).toBe("prd");
    expect(prd?.content).toContain("docs/handbook/vision.md");
    // Once chosen, a second choice does not replace it.
    await expect(
      choosePrd(owner, result.slug, { docSlug: "repo-docs-handbook-notes" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("is refused for a stranger and for a document that did not come from the repository", async () => {
    const result = await importWithoutPrd();
    await expect(
      choosePrd(stranger, result.slug, { docSlug: "repo-docs-handbook-vision" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(choosePrd(owner, result.slug, { docSlug: "nothing-here" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("a PRD pasted or uploaded by hand", () => {
  it("creates the PRD when there is none, and never replaces one", async () => {
    await resetDatabase();
    const owner = await createUser("Owner", "owner@example.test");
    const stranger = await createUser("Stranger", "stranger@example.test");
    const result = await importFromGithub(owner, { repo: "acme/learning" }, "en", {
      adapter: treeAdapter({
        "README.md": "# Learning\n\nAn LMS for a training company with courses and quizzes.\n",
        "package.json": FILES["package.json"],
      }),
      connect: vi.fn(async () => undefined),
    });
    expect(result.adopted.prd).toBe(false);

    await expect(createPrdFromText(owner, result.slug, { content: "short" })).rejects.toMatchObject(
      {
        code: "VALIDATION_ERROR",
      },
    );
    await expect(
      createPrdFromText(stranger, result.slug, { content: "# PRD\n\nNot allowed." }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await createPrdFromText(owner, result.slug, {
      content: "# PRD\n\n## Goals\n\nTeach people.\n",
    });
    const [project] = await db.select().from(projects).where(eq(projects.slug, result.slug));
    const prd = (await db.select().from(documents).where(eq(documents.projectId, project.id))).find(
      (d) => d.slug === "prd",
    );
    expect(prd).toMatchObject({ type: "prd", version: 1 });
    expect(prd?.content).toContain("Teach people.");
    await expect(
      createPrdFromText(owner, result.slug, { content: "# PRD\n\nA second one." }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
