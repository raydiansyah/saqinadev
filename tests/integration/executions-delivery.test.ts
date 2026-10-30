import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import {
  ciRuns,
  deployments,
  deployTargets,
  executionArtifacts,
  executionEvents,
  executions,
  repositoryConnections,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { getExecutionDelivery } from "@/lib/executions/delivery";
import { getExecutionDiff } from "@/lib/executions/diff";
import { modelTaskExecutor } from "@/lib/executions/model-executor";
import { recordPreviewState } from "@/lib/executions/preview";
import { startExecution } from "@/lib/executions/service";
import { drainExecutions } from "@/lib/executions/worker";
import { connectRepository } from "@/lib/git/service";
import { createUser, resetDatabase } from "../helpers/db";
import { fakeTeam, PLAN, taskTitleOf } from "../helpers/engine";
import { seedExecution } from "../helpers/execution";
import { project } from "../helpers/project";

let owner: Actor;
let slug: string;
let repo: string;
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

beforeEach(async () => {
  await resetDatabase();
  repo = mkdtempSync(join(tmpdir(), "saqina-delivery-repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  writeFileSync(join(repo, "README.md"), "# Shop\n");
  git("add", ".");
  git("-c", "user.name=T", "-c", "user.email=t@example.test", "commit", "-q", "-m", "init");
  owner = await createUser("Owner");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
  slug = await project(owner, "An online shop selling handmade candles to local customers");
});

const connect = () => connectRepository(owner, slug, { provider: "custom_local", fullName: repo });

const build = async () => {
  await connect();
  const files: Record<string, { path: string; content: string }[]> = {
    "Checkout API": [
      { path: "src/api/checkout.ts", content: "export const checkout = () => 'order';\n" },
    ],
    "Checkout page": [
      {
        path: "src/app/checkout/page.tsx",
        content: "export default function Page() { return null; }\n",
      },
    ],
  };
  const model = fakeTeam({
    execution_plan: PLAN,
    task_work: (r: Parameters<typeof taskTitleOf>[0]) => ({
      summary: "All done",
      files: files[taskTitleOf(r)] ?? [],
      noChangeNeeded: !files[taskTitleOf(r)],
    }),
    task_review: {
      verdict: "pass",
      summary: "All done",
      criteria: [{ criterion: "c", passed: true, evidence: "src/api/checkout.ts:1" }],
      findings: "",
    },
  });
  const execution = await startExecution(owner, slug, {
    mode: "build",
    request: "Build the checkout",
  });
  await drainExecutions({ provider: model.provider, taskExecutor: modelTaskExecutor });
  return execution;
};

describe("the diff of the work branch", () => {
  it("shows what the agents really changed, from git, with the files and commits", async () => {
    const execution = await build();
    const diff = await getExecutionDiff(owner, slug, execution.id);
    expect(diff).toMatchObject({
      status: "ok",
      base: "main",
      head: `saqina/exec-${execution.id.slice(0, 8)}`,
      aheadBy: 2,
      truncated: false,
    });
    expect(diff.files.map((f) => [f.path, f.status, f.additions]).sort()).toEqual([
      ["src/api/checkout.ts", "added", 1],
      ["src/app/checkout/page.tsx", "added", 1],
    ]);
    expect(diff.files.find((f) => f.path === "src/api/checkout.ts")?.patch).toContain(
      "+export const checkout",
    );
    expect(diff.commits.map((c) => c.message).sort()).toEqual([
      expect.stringContaining("Checkout API"),
      expect.stringContaining("Checkout page"),
    ]);
    // The same commits the Studio listed as artifacts.
    const artifacts = (
      await db.select().from(executionArtifacts).where(eq(executionArtifacts.kind, "commit"))
    )
      .map((a) => a.commitSha)
      .sort();
    expect(diff.commits.map((c) => c.sha).sort()).toEqual(artifacts);
  });

  it("says there is no branch until the first commit, and never makes a diff up", async () => {
    await connect();
    const { execution } = await seedExecution(owner, slug);
    await db
      .update(executions)
      .set({ branch: "saqina/exec-notyet00" })
      .where(eq(executions.id, execution.id));
    expect(await getExecutionDiff(owner, slug, execution.id)).toMatchObject({
      status: "no_branch",
      files: [],
      aheadBy: 0,
    });
    await db.update(executions).set({ branch: null }).where(eq(executions.id, execution.id));
    expect(await getExecutionDiff(owner, slug, execution.id)).toMatchObject({
      status: "no_branch",
      files: [],
    });
  });

  it("says so when no repository is connected", async () => {
    const { execution } = await seedExecution(owner, slug);
    await db
      .update(executions)
      .set({ branch: "saqina/exec-abcd1234" })
      .where(eq(executions.id, execution.id));
    expect(await getExecutionDiff(owner, slug, execution.id)).toMatchObject({
      status: "no_repository",
      files: [],
    });
  });

  it("masks anything that looks like a secret in a patch", async () => {
    await connect();
    const { execution } = await seedExecution(owner, slug);
    const branch = `saqina/exec-${execution.id.slice(0, 8)}`;
    await db.update(executions).set({ branch }).where(eq(executions.id, execution.id));
    git("checkout", "-q", "-b", branch);
    writeFileSync(join(repo, "leak.ts"), `export const k = "ghp_${"a".repeat(36)}";\n`);
    git("add", ".");
    git("-c", "user.name=T", "-c", "user.email=t@example.test", "commit", "-q", "-m", "leak");
    git("checkout", "-q", "main");
    const diff = await getExecutionDiff(owner, slug, execution.id);
    expect(diff.status).toBe("ok");
    expect(JSON.stringify(diff)).not.toContain(`ghp_${"a".repeat(36)}`);
    expect(diff.files[0].patch).toContain("[redacted]");
  });

  it("is only for members, and an id from another project is unknown", async () => {
    const execution = await build();
    const stranger = await createUser("Stranger");
    const otherSlug = await project(stranger, "A blog about travel photography with weekly posts");
    expect(await code(getExecutionDiff(stranger, slug, execution.id))).toBe("NOT_FOUND");
    expect(await code(getExecutionDiff(stranger, otherSlug, execution.id))).toBe("NOT_FOUND");
    expect(await code(getExecutionDiff(owner, slug, "not-an-id"))).toBe("NOT_FOUND");
  });
});

const seedBranch = async () => {
  await connect();
  const { execution, projectId } = await seedExecution(owner, slug, { status: "succeeded" });
  const branch = `saqina/exec-${execution.id.slice(0, 8)}`;
  await db.update(executions).set({ branch }).where(eq(executions.id, execution.id));
  return { execution, projectId, branch };
};
const commit = (executionId: string, projectId: string, sha = "1".repeat(40)) =>
  db
    .insert(executionArtifacts)
    .values({ projectId, executionId, kind: "commit", commitSha: sha, summary: "c" });

describe("preview, build and the five stages", () => {
  const stages = async (id: string) =>
    Object.fromEntries(
      (await getExecutionDelivery(owner, slug, id)).stages.map((s) => [s.key, s.state]),
    );

  it("claims nothing before there is code", async () => {
    const { execution } = await seedBranch();
    const delivery = await getExecutionDelivery(owner, slug, execution.id);
    expect(delivery.preview.status).toBe("no_commits");
    expect(await stages(execution.id)).toEqual({
      source: "unknown",
      build: "unknown",
      preview: "unknown",
      deploy: "unknown",
      published: "unknown",
    });
  });

  it("says unknown for a build and a preview nobody reported, and done for source", async () => {
    const { execution, projectId } = await seedBranch();
    await commit(execution.id, projectId);
    const delivery = await getExecutionDelivery(owner, slug, execution.id);
    expect(delivery.preview.status).toBe("none_yet");
    expect(delivery.ci.status).toBe("none");
    expect(await stages(execution.id)).toMatchObject({
      source: "done",
      build: "unknown",
      preview: "unknown",
      published: "unknown",
    });
  });

  it("follows CI on the work branch: running, passed, failed", async () => {
    const { execution, projectId, branch } = await seedBranch();
    await commit(execution.id, projectId);
    const run = (
      externalId: string,
      status: "queued" | "in_progress" | "completed",
      conclusion: string | null,
    ) =>
      db
        .insert(ciRuns)
        .values({
          projectId,
          externalId,
          sha: "1".repeat(40),
          branch,
          name: "CI",
          status,
          conclusion,
        })
        .onConflictDoUpdate({
          target: [ciRuns.projectId, ciRuns.externalId],
          set: { status, conclusion },
        });
    await run("r1", "in_progress", null);
    expect((await stages(execution.id)).build).toBe("pending");
    await run("r1", "completed", "success");
    expect((await stages(execution.id)).build).toBe("done");
    expect((await getExecutionDelivery(owner, slug, execution.id)).ci.status).toBe("passed");
    await run("r2", "completed", "failure");
    expect((await stages(execution.id)).build).toBe("blocked");
    // CI on another branch says nothing about this one.
    await db.delete(ciRuns);
    await db.insert(ciRuns).values({
      projectId,
      externalId: "other",
      sha: "9".repeat(40),
      branch: "main",
      name: "CI",
      status: "completed",
      conclusion: "success",
    });
    expect((await stages(execution.id)).build).toBe("unknown");
  });

  it("shows the preview of this work branch only, with its real state", async () => {
    const { execution, projectId, branch } = await seedBranch();
    await commit(execution.id, projectId);
    const deploy = (
      externalId: string,
      ref: string | null,
      state: "pending" | "success" | "failure",
      sha: string | null = null,
    ) =>
      db
        .insert(deployments)
        .values({
          projectId,
          provider: "vercel",
          externalId,
          environment: "preview",
          state,
          url: `https://${externalId}.example.test`,
          sha,
          ref,
        })
        .onConflictDoUpdate({
          target: [deployments.projectId, deployments.provider, deployments.externalId],
          set: { state },
        });
    await deploy("other", "saqina/exec-zzzzzzzz", "success");
    expect((await getExecutionDelivery(owner, slug, execution.id)).preview.status).toBe("none_yet");

    await deploy("mine", branch, "pending");
    expect((await getExecutionDelivery(owner, slug, execution.id)).preview).toMatchObject({
      status: "pending",
      url: null,
    });
    await deploy("mine", branch, "success");
    const ready = await getExecutionDelivery(owner, slug, execution.id);
    expect(ready.preview).toMatchObject({ status: "ready", url: "https://mine.example.test" });
    expect((await stages(execution.id)).preview).toBe("done");
    await deploy("mine", branch, "failure");
    expect((await getExecutionDelivery(owner, slug, execution.id)).preview).toMatchObject({
      status: "failed",
      url: null,
    });
    expect((await stages(execution.id)).preview).toBe("blocked");
    // A deployment with no branch is matched by one of the agents' commits.
    await db.delete(deployments);
    await deploy("by-sha", null, "success", "1".repeat(40));
    expect((await getExecutionDelivery(owner, slug, execution.id)).preview.status).toBe("ready");
  });

  it("does not show another project's preview for the same branch name", async () => {
    const { execution, projectId, branch } = await seedBranch();
    await commit(execution.id, projectId);
    const stranger = await createUser("Stranger");
    const otherSlug = await project(stranger, "A blog about travel photography with weekly posts");
    const other = await seedExecution(stranger, otherSlug);
    await db.insert(deployments).values({
      projectId: other.projectId,
      provider: "vercel",
      externalId: "theirs",
      environment: "preview",
      state: "success",
      url: "https://theirs.example.test",
      ref: branch,
    });
    expect((await getExecutionDelivery(owner, slug, execution.id)).preview.status).toBe("none_yet");
    void projectId;
  });

  it("keeps deploy ready and published separate from a finished build, and publishes nothing", async () => {
    const { execution, projectId } = await seedBranch();
    await commit(execution.id, projectId);
    expect((await stages(execution.id)).deploy).toBe("unknown");
    await db.insert(deployTargets).values({ projectId, status: "ready" });
    expect((await stages(execution.id)).deploy).toBe("done");
    expect((await stages(execution.id)).published).toBe("unknown");
    // A production deployment from before these commits is not this work being published.
    await db.insert(deployments).values({
      projectId,
      provider: "vercel",
      externalId: "old",
      environment: "production",
      state: "success",
      url: "https://old.example.test",
      updatedAt: new Date(Date.now() - 86_400_000),
    });
    expect((await stages(execution.id)).published).toBe("unknown");
    await db.insert(deployments).values({
      projectId,
      provider: "vercel",
      externalId: "new",
      environment: "production",
      state: "success",
      url: "https://new.example.test",
      updatedAt: new Date(Date.now() + 60_000),
    });
    expect((await stages(execution.id)).published).toBe("done");
    // No repository connection: it cannot be deployed from here.
    await db.delete(repositoryConnections);
    expect((await stages(execution.id)).deploy).toBe("blocked");
  });

  it("is only for members", async () => {
    const { execution } = await seedBranch();
    const stranger = await createUser("Stranger");
    expect(await code(getExecutionDelivery(stranger, slug, execution.id))).toBe("NOT_FOUND");
  });
});

describe("preview news in the execution's log", () => {
  const record = (
    tx: typeof db,
    input: Partial<Parameters<typeof recordPreviewState>[1]> & {
      projectId: string;
      ref: string | null;
    },
  ) =>
    recordPreviewState(tx, {
      deploymentId: "vercel:d1",
      state: "pending",
      url: null,
      environment: "preview",
      ...input,
    });
  const events = async (id: string) =>
    (await db.select().from(executionEvents).where(eq(executionEvents.executionId, id)))
      .filter((e) => e.type.startsWith("preview."))
      .map((e) => e.type);

  it("announces building, ready and failed for the work branch, once each", async () => {
    const { execution, projectId, branch } = await seedBranch();
    await record(db, { projectId, ref: branch, state: "pending" });
    await record(db, { projectId, ref: branch, state: "pending" });
    await record(db, { projectId, ref: branch, state: "success", url: "https://d1.example.test" });
    await record(db, { projectId, ref: branch, state: "success", url: "https://d1.example.test" });
    await record(db, { projectId, ref: branch, state: "failure", deploymentId: "vercel:d2" });
    expect(await events(execution.id)).toEqual([
      "preview.build_started",
      "preview.updated",
      "preview.failed",
    ]);
  });

  it("ignores production, a branch that is not a work branch, and one that belongs to another project", async () => {
    const { execution, projectId, branch } = await seedBranch();
    await record(db, { projectId, ref: branch, state: "success", environment: "production" });
    await record(db, { projectId, ref: "main", state: "success" });
    await record(db, { projectId, ref: null, state: "success" });
    const stranger = await createUser("Stranger");
    const other = await seedExecution(
      stranger,
      await project(stranger, "A blog about travel photography with weekly posts"),
    );
    await record(db, { projectId: other.projectId, ref: branch, state: "success" });
    expect(await events(execution.id)).toEqual([]);
  });
});
