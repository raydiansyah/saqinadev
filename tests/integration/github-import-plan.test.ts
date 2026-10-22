import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProvider } from "@/lib/ai/provider";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { documents, milestones, projects, requirements, tasks } from "@/lib/db/schema";
import { type FileEntry, type GitAdapter, GitError } from "@/lib/git/types";
import { importFromGithub } from "@/lib/imports/service";
import { syncRequirementsFromDocs } from "@/lib/imports/sync";
import { completeInterview, getInterviewState } from "@/lib/interviews/service";
import { createUser, resetDatabase } from "../helpers/db";

const FILES: Record<string, string> = {
  "README.md": "# Bakery Orders\n\nAn ordering app for a neighbourhood bakery.\n",
  "PRD.md":
    "# Bakery PRD\n\n## Features\n- Customers reserve a pickup slot\n- Bakers print a production list\n",
  "docs/PLAN.md":
    "# Plan\n\n## Phase 1: Ordering\nBuild the ordering flow first.\n\n## Phase 2: Kitchen\nThen the production list.\n",
  "docs/TASKS.md": `# Tasks

## Phase 1: Ordering
- [x] Set up the Next.js project
- [ ] Pickup slot picker
- [ ] Order confirmation email

## Phase 2: Kitchen
- [ ] Daily production list
`,
  "package.json": JSON.stringify({ dependencies: { next: "16", pg: "8" } }),
};

function adapter(files: Record<string, string>): GitAdapter {
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
      const out: FileEntry[] = [];
      const seen = new Set<string>();
      for (const p of Object.keys(files)) {
        if (!p.startsWith(dir)) continue;
        const rest = p.slice(dir.length);
        const [head, ...tail] = rest.split("/");
        // A subfolder is listed once, as a folder, the way a real host lists it.
        if (tail.length > 0) {
          if (!seen.has(head)) out.push({ path: `${dir}${head}`, type: "dir" });
          seen.add(head);
        } else out.push({ path: p, type: "file", size: files[p].length });
      }
      return out;
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

let owner: Actor;

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner", "owner@example.test");
});

async function run(files: Record<string, string> = FILES) {
  const { slug } = await importFromGithub(owner, { repo: "acme/bakery" }, "en", {
    adapter: adapter(files),
    connect: vi.fn(async () => undefined),
  });
  const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
  const docs = () => db.select().from(documents).where(eq(documents.projectId, project.id));
  const taskRows = () => db.select().from(tasks).where(eq(tasks.projectId, project.id));
  const milestoneRows = () =>
    db.select().from(milestones).where(eq(milestones.projectId, project.id));
  return { slug, project, docs, taskRows, milestoneRows };
}

describe("PRD, plan and tasks of an imported project", () => {
  it("are filled from the repository right after the import, before the interview is finished", async () => {
    const { docs, taskRows } = await run();
    const all = await docs();
    const prd = all.find((d) => d.slug === "prd");
    const plan = all.find((d) => d.slug === "plan");
    expect(prd?.type).toBe("prd");
    expect(prd?.content).toContain("Customers reserve a pickup slot");
    expect(plan?.type).toBe("plan");
    expect(plan?.content).toContain("Build the ordering flow first");
    expect((await taskRows()).map((t) => t.title).sort()).toEqual([
      "Daily production list",
      "Order confirmation email",
      "Pickup slot picker",
      "Set up the Next.js project",
    ]);
  });

  it("keeps them after the interview is finished: nothing generic replaces or doubles them", async () => {
    const { slug, docs, taskRows, milestoneRows } = await run();
    await completeInterview(owner, slug);
    const all = await docs();
    expect(all.filter((d) => d.slug === "prd")).toHaveLength(1);
    expect(all.find((d) => d.slug === "prd")?.content).toContain("Customers reserve a pickup slot");
    expect(all.find((d) => d.slug === "plan")?.content).toContain("Build the ordering flow first");
    const rows = await taskRows();
    expect(rows).toHaveLength(4);
    expect(rows.every((t) => t.source === "imported")).toBe(true);
    expect((await milestoneRows()).map((m) => m.title).sort()).toEqual([
      "Phase 1: Ordering",
      "Phase 2: Kitchen",
    ]);
  });

  it("keeps each task's state and groups it under its phase", async () => {
    const { taskRows, milestoneRows } = await run();
    const rows = await taskRows();
    const done = rows.find((t) => t.title === "Set up the Next.js project");
    expect(done?.status).toBe("done");
    expect(done?.completedAt).not.toBeNull();
    expect(rows.find((t) => t.title === "Pickup slot picker")?.status).toBe("todo");
    const phases = new Map((await milestoneRows()).map((m) => [m.id, m.title]));
    expect(
      phases.get(rows.find((t) => t.title === "Daily production list")?.milestoneId ?? ""),
    ).toBe("Phase 2: Kitchen");
  });

  it("uses checkboxes in the plan when there is no task list", async () => {
    const { taskRows } = await run({
      ...FILES,
      "docs/TASKS.md": "",
      "docs/PLAN.md":
        "# Plan\n\n## Phase 1\n- [ ] Build ordering\n- Plain bullet that is not a task\n",
    });
    expect((await taskRows()).map((t) => t.title)).toEqual(["Build ordering"]);
  });

  it("generates what the repository lacks, and only that", async () => {
    const { docs, taskRows } = await run({
      "README.md": FILES["README.md"],
      "package.json": FILES["package.json"],
    });
    const all = await docs();
    // No PRD or plan in the repository: no document is written for it. Documents follow GitHub only.
    expect(all.some((d) => d.slug === "prd" || d.slug === "plan")).toBe(false);
    // Nor tasks: they stay empty until a person runs the interview or writes a PRD.
    expect(await taskRows()).toHaveLength(0);
  });

  /** An import as it worked before: copies as repo-*, and a generated PRD, plan and tasks. */
  async function legacyize(projectId: string) {
    await db.delete(tasks).where(eq(tasks.projectId, projectId));
    await db.delete(milestones).where(eq(milestones.projectId, projectId));
    for (const [from, to] of [
      ["prd", "repo-prd"],
      ["plan", "repo-plan"],
    ] as const)
      await db
        .update(documents)
        .set({ slug: to, type: "custom" })
        .where(and(eq(documents.projectId, projectId), eq(documents.slug, from)));
    await db.insert(documents).values([
      { projectId, type: "prd", title: "PRD", slug: "prd", content: "# Generated PRD" },
      { projectId, type: "plan", title: "PLAN", slug: "plan", content: "# Generated plan" },
    ]);
    const [m] = await db
      .insert(milestones)
      .values({ projectId, title: "Generated", goal: "", position: 0 })
      .returning();
    await db.insert(tasks).values([
      { projectId, milestoneId: m.id, title: "Generated one", source: "plan", status: "backlog" },
      { projectId, milestoneId: m.id, title: "Generated two", source: "plan", status: "todo" },
    ]);
  }

  it("brings an earlier import up to date, replacing only untouched generated ones", async () => {
    const { slug, project, docs, taskRows } = await run();
    await legacyize(project.id);

    const result = await syncRequirementsFromDocs(owner, slug, {}, "en");
    expect(result.adopted).toEqual({ prd: "adopted", plan: "adopted", tasks: 4 });
    const after = await docs();
    expect(after.find((d) => d.slug === "prd")?.content).toContain(
      "Customers reserve a pickup slot",
    );
    expect(after.some((d) => d.slug === "repo-prd")).toBe(false);
    expect((await taskRows()).every((t) => t.source === "imported")).toBe(true);
    // Running it again changes nothing.
    expect((await syncRequirementsFromDocs(owner, slug, {}, "en")).adopted).toEqual({
      prd: "already",
      plan: "already",
      tasks: 0,
    });
  });

  it("never replaces a PRD or tasks a person has worked on", async () => {
    const { slug, project, docs, taskRows } = await run();
    await legacyize(project.id);
    // Someone edits the generated PRD and picks up a task.
    await db
      .update(documents)
      .set({ version: 2, content: "Our own PRD" })
      .where(and(eq(documents.projectId, project.id), eq(documents.slug, "prd")));
    const [task] = await taskRows();
    await db.update(tasks).set({ status: "in_progress" }).where(eq(tasks.id, task.id));
    const before = (await taskRows()).length;

    const result = await syncRequirementsFromDocs(owner, slug, {}, "en");
    expect(result.adopted.prd).toBe("kept");
    expect(result.adopted.tasks).toBe(0);
    expect((await docs()).find((d) => d.slug === "prd")?.content).toBe("Our own PRD");
    expect((await taskRows()).length).toBe(before);
  });

  it("keeps the repository's files readable by the project", async () => {
    const { slug } = await run();
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    expect(access.project.slug).toBe(slug);
  });

  it("is ready to use at once: the interview is done and optional", async () => {
    const { project } = await run();
    const state = await getInterviewState(owner, project.slug);
    expect(state.status).toBe("completed");
    const reqs = await db.select().from(requirements).where(eq(requirements.projectId, project.id));
    expect(reqs.length).toBeGreaterThan(0);
    // The name read from the repository survives the setup.
    expect(project.name).toBe("Bakery Orders");
    const [after] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(after.name).toBe("Bakery Orders");
  });

  it("finds a PRD, plan and tasks deep inside docs, under names nobody agreed on", async () => {
    const { docs, taskRows } = await run({
      "README.md": FILES["README.md"],
      "package.json": FILES["package.json"],
      "docs/produk/kebutuhan.md":
        "# Kebutuhan Produk\n\n## Fitur\n- Pemesanan slot pengambilan\n\n## Tujuan\n- Kurangi antrean\n",
      "docs/strategy/q4/rollout.md":
        "# Roadmap for the first release\n\n## Phase 1\nOrdering.\n\n## Phase 2\nKitchen.\n",
      "docs/work/next.md":
        "# Sprint notes\n\n- [ ] Pickup slots\n- [x] Set up\n- [ ] Emails\n- [ ] Print list\n- [ ] Refunds\n",
    });
    const all = await docs();
    expect(all.find((d) => d.slug === "prd")?.content).toContain("Pemesanan slot pengambilan");
    expect(all.find((d) => d.slug === "plan")?.content).toContain("Phase 2");
    expect((await taskRows()).map((t) => t.title)).toContain("Pickup slots");
  });

  describe("with a model's help", () => {
    const WEIRD = {
      "README.md": FILES["README.md"],
      "package.json": FILES["package.json"],
      "docs/strategy/v1.md":
        "We will build the bakery app. Customers reserve slots and bakers print a list.",
      "docs/notes/misc.md": "Random thoughts about colours.",
    };
    const model = (roles: unknown[]) => {
      let roleCalls = 0;
      const p = {
        deterministic: false,
        config: { provider: "mock" as const, model: "m" },
        generate: async () => "",
        stream: async function* () {},
        generateObject: async (_r: unknown, _s: unknown, name: string) => {
          if (name === "document_roles") {
            roleCalls += 1;
            return { documents: roles };
          }
          return {
            name: "Bakery Orders",
            description: "An ordering app for a neighbourhood bakery.",
            projectType: null,
            audience: [],
            features: [],
            platforms: [],
            authMethods: [],
          };
        },
      };
      return { provider: p as unknown as AiProvider, calls: () => roleCalls };
    };
    const runWith = async (provider: AiProvider, useAi: boolean) => {
      const { slug } = await importFromGithub(owner, { repo: "acme/bakery", useAi }, "en", {
        adapter: adapter(WEIRD),
        aiProvider: provider,
        connect: vi.fn(async () => undefined),
      });
      const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
      return db.select().from(documents).where(eq(documents.projectId, project.id));
    };

    it("uses its picks for documents the names and text do not reveal", async () => {
      const m = model([{ path: "docs/strategy/v1.md", role: "prd", confidence: 90 }]);
      const all = await runWith(m.provider, true);
      expect(all.find((d) => d.slug === "prd")?.content).toContain("Customers reserve slots");
      expect(m.calls()).toBe(1);
    });

    it("ignores picks of documents that do not exist or that it is unsure about", async () => {
      const m = model([
        { path: "docs/made-up.md", role: "prd", confidence: 99 },
        { path: "docs/notes/misc.md", role: "plan", confidence: 30 },
      ]);
      const all = await runWith(m.provider, true);
      expect(all.some((d) => d.slug === "prd" || d.slug === "plan")).toBe(false);
    });

    it("never asks without consent", async () => {
      const m = model([{ path: "docs/strategy/v1.md", role: "prd", confidence: 90 }]);
      const all = await runWith(m.provider, false);
      expect(m.calls()).toBe(0);
      expect(all.some((d) => d.slug === "prd")).toBe(false);
    });
  });
});
