import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { documents, milestones, projects, tasks } from "@/lib/db/schema";
import { type FileEntry, type GitAdapter, GitError } from "@/lib/git/types";
import { importFromGithub } from "@/lib/imports/service";
import { syncRequirementsFromDocs } from "@/lib/imports/sync";
import { completeInterview } from "@/lib/interviews/service";
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
    const { slug, docs, taskRows } = await run({
      "README.md": FILES["README.md"],
      "package.json": FILES["package.json"],
    });
    expect((await docs()).some((d) => d.slug === "prd")).toBe(false);
    expect(await taskRows()).toEqual([]);
    await completeInterview(owner, slug);
    const all = await docs();
    expect(all.find((d) => d.slug === "prd")?.content).not.toContain("Imported from");
    expect((await taskRows()).length).toBeGreaterThan(0);
  });

  it("brings an earlier import up to date, replacing only untouched generated ones", async () => {
    const { slug, project, docs, taskRows } = await run();
    // Recreate how an import looked before: the copies sit as repo-* and the project's own
    // PRD, plan and tasks were generated from the interview.
    await db.delete(tasks).where(eq(tasks.projectId, project.id));
    await db.delete(milestones).where(eq(milestones.projectId, project.id));
    for (const [from, to] of [
      ["prd", "repo-prd"],
      ["plan", "repo-plan"],
    ] as const)
      await db.update(documents).set({ slug: to, type: "custom" }).where(eq(documents.slug, from));
    await completeInterview(owner, slug);
    expect((await docs()).find((d) => d.slug === "prd")?.content).not.toContain("pickup slot");
    expect((await taskRows()).every((t) => t.source === "plan")).toBe(true);

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
    for (const [from, to] of [
      ["prd", "repo-prd"],
      ["plan", "repo-plan"],
    ] as const)
      await db.update(documents).set({ slug: to, type: "custom" }).where(eq(documents.slug, from));
    await db.delete(tasks).where(eq(tasks.projectId, project.id));
    await db.delete(milestones).where(eq(milestones.projectId, project.id));
    await completeInterview(owner, slug);
    // Someone edits the generated PRD and picks up a task.
    await db
      .update(documents)
      .set({ version: 2, content: "Our own PRD" })
      .where(eq(documents.slug, "prd"));
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
});
