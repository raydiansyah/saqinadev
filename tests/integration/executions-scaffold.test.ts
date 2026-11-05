import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { executionEvents, users } from "@/lib/db/schema";
import { modelTaskExecutor } from "@/lib/executions/model-executor";
import { startExecution } from "@/lib/executions/service";
import { getExecutionView } from "@/lib/executions/view";
import { drainExecutions } from "@/lib/executions/worker";
import { connectRepository } from "@/lib/git/service";
import { createUser, resetDatabase } from "../helpers/db";
import { fakeTeam, taskTitleOf } from "../helpers/engine";
import { project } from "../helpers/project";

let owner: Actor;
let slug: string;
let repo: string;
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

/** A new repository holding only a readme: the case of a project that starts from an idea. */
beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "saqina-empty-repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  writeFileSync(join(repo, "README.md"), "# Peta\n");
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
  slug = await project(owner, "A map where visitors search for a place and pick one point");
  await connectRepository(owner, slug, { provider: "custom_local", fullName: repo });
});

const PLAN = {
  goal: "Search a place on a map",
  risks: [],
  tasks: [
    {
      key: "svc",
      title: "Search service",
      description: "Geocoding route that works without an API key.",
      role: "backend",
      dependsOn: [] as string[],
      acceptanceCriteria: ["Blank input is refused"],
      targetPaths: ["src/lib/search.ts", ".env.example"],
      priority: "high",
    },
  ],
};
const PASS = {
  verdict: "pass",
  summary: "Holds.",
  criteria: [
    { criterion: "Blank input is refused", passed: true, evidence: "src/lib/search.ts:1" },
  ],
  findings: "",
};

const run = async (writes: { path: string; content: string }[]) => {
  const model = fakeTeam({
    execution_plan: PLAN,
    task_work: (r: Parameters<typeof taskTitleOf>[0]) => ({
      summary: `Did ${taskTitleOf(r)}`,
      files: writes,
      noChangeNeeded: false,
    }),
    task_review: PASS,
  });
  const started = await startExecution(owner, slug, { mode: "build", request: "Build the map" });
  await drainExecutions({ provider: model.provider, taskExecutor: modelTaskExecutor });
  return { model, id: started.id, view: await getExecutionView(owner, slug, started.id) };
};

describe("an app made from an idea alone", () => {
  it("starts from a working app, then adds the task's files, including an env template", async () => {
    const { view, id } = await run([
      { path: "src/lib/search.ts", content: "export const search = (q: string) => q.trim();\n" },
      { path: ".env.example", content: "GEOCODER_API_KEY=\n" },
    ]);
    expect(view.execution.status).toBe("succeeded");
    const branch = `saqina/exec-${id.slice(0, 8)}`;
    const tree = git("ls-tree", "-r", "--name-only", branch).split("\n");
    // The platform's own commit gave a buildable base before any task wrote anything.
    for (const f of [
      "package.json",
      "tsconfig.json",
      "next.config.ts",
      "src/app/layout.tsx",
      "src/app/page.tsx",
    ])
      expect(tree, f).toContain(f);
    expect(JSON.parse(git("show", `${branch}:package.json`)).scripts.build).toBe("next build");
    // And the task's own files, with the template that used to be refused.
    expect(tree).toContain("src/lib/search.ts");
    expect(git("show", `${branch}:.env.example`)).toContain("GEOCODER_API_KEY");
    // The scaffold is one commit; the task's work is another. The main branch did not move.
    expect(git("rev-list", "--count", `main..${branch}`)).toBe("2");
    expect(git("ls-tree", "--name-only", "main")).toBe("README.md");
  });

  it("tells the model the rules it will be held to, and that the app must start with no setup", async () => {
    const { model } = await run([{ path: "src/lib/search.ts", content: "export {};\n" }]);
    const call = model.seen.find((c) => c.name === "task_work");
    const labels = call?.request.segments.map((s) => s.label) ?? [];
    expect(labels).toContain("writing rules");
    expect(labels).toContain("quality bar");
    // The agent is told which variable names exist, never a value.
    expect(labels).toContain("environment variables");
    const rules = call?.request.segments.find((s) => s.label === "writing rules")?.content ?? "";
    expect(rules).toContain("src/lib/search.ts");
    expect(rules).toContain(".env.example");
    const bar = call?.request.segments.find((s) => s.label === "quality bar")?.content ?? "";
    expect(bar).toContain("no environment variables");
  });

  it("still refuses a real env file, says which one, and lets the agent try again", async () => {
    const { id } = await run([{ path: ".env.local", content: "KEY=abc\n" }]);
    const failures = await db
      .select({ payload: executionEvents.payload })
      .from(executionEvents)
      .where(and(eq(executionEvents.executionId, id), eq(executionEvents.type, "task.failed")));
    const reasons = failures.map((f) => String((f.payload as { reason?: string }).reason));
    expect(reasons.length).toBeGreaterThan(0);
    for (const r of reasons) {
      expect(r).toMatch(/^write_refused:/);
      expect(r).toContain(".env.local");
    }
    // Nothing was committed for the refused change: only the platform's starting app is there.
    expect(git("rev-list", "--count", `main..saqina/exec-${id.slice(0, 8)}`)).toBe("1");
  });

  it("does not start another app over a repository that already has one", async () => {
    execFileSync("git", ["-C", repo, "checkout", "-q", "main"]);
    writeFileSync(join(repo, "package.json"), '{"name":"mine"}\n');
    git("add", ".");
    git("-c", "user.name=T", "-c", "user.email=t@example.test", "commit", "-q", "-m", "mine");
    const { id } = await run([{ path: "src/lib/search.ts", content: "export {};\n" }]);
    const branch = `saqina/exec-${id.slice(0, 8)}`;
    expect(JSON.parse(git("show", `${branch}:package.json`)).name).toBe("mine");
    expect(git("rev-list", "--count", `main..${branch}`)).toBe("1");
  });
});
