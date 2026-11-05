import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { executionEvents, executionJobs, executions, projects, users } from "@/lib/db/schema";
import { modelTaskExecutor } from "@/lib/executions/model-executor";
import { recordPreviewState } from "@/lib/executions/preview";
import { requestRepair } from "@/lib/executions/repair";
import { startExecution } from "@/lib/executions/service";
import { drainExecutions } from "@/lib/executions/worker";
import { connectRepository } from "@/lib/git/service";
import { createUser, resetDatabase } from "../helpers/db";
import { fakeTeam, taskTitleOf } from "../helpers/engine";
import { project } from "../helpers/project";

let owner: Actor;
let slug: string;
let projectId: string;
let repo: string;
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "saqina-repair-repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  writeFileSync(join(repo, "README.md"), "# Shop\n");
  writeFileSync(join(repo, "package.json"), '{"name":"shop"}\n');
  git("add", ".");
  git("-c", "user.name=T", "-c", "user.email=t@example.test", "commit", "-q", "-m", "init");
});
afterAll(async () => {
  await resetDatabase();
});
beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
  slug = await project(owner, "A shop for handmade candles to local customers");
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
  projectId = p.id;
  await connectRepository(owner, slug, { provider: "custom_local", fullName: repo });
});

const PLAN = (title: string, path: string) => ({
  goal: title,
  risks: [],
  tasks: [
    {
      key: "t",
      title,
      description: title,
      role: "backend",
      dependsOn: [] as string[],
      acceptanceCriteria: ["It builds"],
      targetPaths: [path],
      priority: "high",
    },
  ],
});
const PASS = {
  verdict: "pass",
  summary: "Holds.",
  criteria: [{ criterion: "It builds", passed: true, evidence: "src/lib/search.ts:1" }],
  findings: "",
};
const team = (title: string, content: string) =>
  fakeTeam({
    execution_plan: PLAN(title, "src/lib/search.ts"),
    task_work: (r: Parameters<typeof taskTitleOf>[0]) => ({
      summary: `Did ${taskTitleOf(r)}`,
      files: [{ path: "src/lib/search.ts", content }],
      noChangeNeeded: false,
    }),
    task_review: PASS,
  });
/** Works the queue until nothing is waiting: a repair starts an execution whose own jobs follow. */
async function drain(m: ReturnType<typeof team>) {
  for (let i = 0; i < 12; i++) {
    await drainExecutions({ provider: m.provider, taskExecutor: modelTaskExecutor });
    const waiting = await db
      .select({ id: executionJobs.id })
      .from(executionJobs)
      .where(inArray(executionJobs.status, ["pending", "running"]));
    if (waiting.length === 0) return;
  }
}

async function finishedBuild() {
  const started = await startExecution(owner, slug, { mode: "build", request: "Build the search" });
  await drain(team("Search service", "export const search = (q: string) => q;\n"));
  const [row] = await db.select().from(executions).where(eq(executions.id, started.id));
  expect(row.status).toBe("succeeded");
  return row;
}
const failBuild = (branch: string, n: number) =>
  recordPreviewState(db, {
    projectId,
    ref: branch,
    deploymentId: `vercel:dpl_${n}`,
    state: "failure",
    url: "https://x.vercel.app",
    environment: "preview",
  });
const children = (rootId: string) =>
  db.select().from(executions).where(eq(executions.parentExecutionId, rootId));
const eventsOf = async (id: string, type: string) =>
  db
    .select()
    .from(executionEvents)
    .where(and(eq(executionEvents.executionId, id), eq(executionEvents.type, type)));

describe("a failed build or check on finished work is repaired once more", () => {
  it("starts a follow-up on the same branch, with the failure in its request, and fixes it", async () => {
    const orig = await finishedBuild();
    const branch = orig.branch as string;
    expect(git("rev-list", "--count", `main..${branch}`)).toBe("1");

    await failBuild(branch, 1);
    const [job] = await db.select().from(executionJobs).where(eq(executionJobs.kind, "repair"));
    expect(job.idempotencyKey).toContain("vercel:dpl_1");
    await drain(team("Fix the build", "export const search = (q: string) => q.trim();\n"));

    const [fix] = await children(orig.id);
    expect(fix).toMatchObject({
      branch,
      mode: "build",
      status: "succeeded",
      parentExecutionId: orig.id,
    });
    expect(fix.request).toContain('Fix the failed preview build "Preview build"');
    // The fix landed on the same branch, so the next preview builds the fixed code.
    expect(git("rev-list", "--count", `main..${branch}`)).toBe("2");
    expect(git("show", `${branch}:src/lib/search.ts`)).toContain("q.trim()");
    expect(await eventsOf(orig.id, "repair.started")).toHaveLength(1);
  });

  it("handles one failure once, even when it is reported twice", async () => {
    const orig = await finishedBuild();
    await failBuild(orig.branch as string, 1);
    await requestRepair(db, {
      projectId,
      branch: orig.branch,
      failed: { source: "build", key: "vercel:dpl_1", name: "Preview build", url: null },
    });
    expect(
      await db.select().from(executionJobs).where(eq(executionJobs.kind, "repair")),
    ).toHaveLength(1);
  });

  it("tries at most twice, then says so instead of looping", async () => {
    const orig = await finishedBuild();
    const branch = orig.branch as string;
    for (const n of [1, 2]) {
      await failBuild(branch, n);
      await drain(team(`Fix ${n}`, `export const search = (q: string) => q + "${n}";\n`));
    }
    expect(await children(orig.id)).toHaveLength(2);
    await failBuild(branch, 3);
    await drain(team("Fix 3", "export const search = () => 3;\n"));
    expect(await children(orig.id)).toHaveLength(2);
    // The note goes on the execution whose build failed, the newest one, where the person is looking.
    const [last] = (await children(orig.id)).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const skipped = await eventsOf(last.id, "repair.skipped");
    expect(skipped.at(-1)?.payload).toMatchObject({ reason: "budget" });
  });

  it("ignores a failure on any other branch, a passing build, and work that is not finished", async () => {
    const orig = await finishedBuild();
    await failBuild("feature/not-ours", 1);
    await recordPreviewState(db, {
      projectId,
      ref: orig.branch,
      deploymentId: "vercel:dpl_ok",
      state: "success",
      url: null,
      environment: "preview",
    });
    expect(
      await db.select().from(executionJobs).where(eq(executionJobs.kind, "repair")),
    ).toHaveLength(0);

    await db.update(executions).set({ status: "running" }).where(eq(executions.id, orig.id));
    await failBuild(orig.branch as string, 2);
    expect(
      await db.select().from(executionJobs).where(eq(executionJobs.kind, "repair")),
    ).toHaveLength(0);
  });

  it("does not start a repair for a person who no longer has access", async () => {
    const orig = await finishedBuild();
    await failBuild(orig.branch as string, 1);
    await db.delete(users).where(eq(users.id, owner.id));
    await drain(team("Fix", "export const search = () => 1;\n"));
    expect(await children(orig.id)).toHaveLength(0);
  });
});
