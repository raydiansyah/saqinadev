import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { CONFIG_FIELDS } from "@/lib/agent-definitions/input";
import {
  listDefinitions,
  setDefinitionStatus,
  updateDefinition,
} from "@/lib/agent-definitions/service";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import {
  agentMessages,
  agentRuns,
  executionArtifacts,
  executionEvents,
  executionJobs,
  executions,
  projectMembers,
  projects,
  tasks,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { enqueueJob } from "@/lib/executions/jobs";
import { postMessage } from "@/lib/executions/messages";
import {
  buildFromPlan,
  cancelExecution,
  listExecutions,
  MAX_OPEN_EXECUTIONS,
  retryTask,
  revisePlan,
  startExecution,
} from "@/lib/executions/service";
import { getExecutionView } from "@/lib/executions/view";
import { drainExecutions } from "@/lib/executions/worker";
import { createUser, resetDatabase } from "../helpers/db";
import {
  executionStatus,
  fakePlanner,
  gate,
  PLAN,
  runToEnd,
  scripted,
  taskStatus,
  waitFor,
} from "../helpers/engine";
import { seedExecution } from "../helpers/execution";
import { project } from "../helpers/project";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

let owner: Actor;
let slug: string;
beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
  slug = await project(owner, "An online shop selling handmade candles to local customers");
});

const later = () => new Date(Date.now() + 10 * 60_000);
const runsOf = async (executionId: string, title: string) => {
  const [t] = (await db.select().from(tasks).where(eq(tasks.executionId, executionId))).filter(
    (x) => x.title === title,
  );
  return db.select().from(agentRuns).where(eq(agentRuns.taskId, t.id));
};

describe("cancelling", () => {
  it("stops work nobody is doing at once, and says cancelling until the running task returns", async () => {
    const { provider } = fakePlanner(PLAN);
    const hold = gate();
    const { executor, calls } = scripted({
      backend: async (input) => {
        await hold.opened;
        return {
          outcome: "succeeded",
          summary: "api",
          artifacts: [{ kind: "commit", commitSha: `sha-${input.task.id}`, summary: "api" }],
        };
      },
    });
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build" });
    const drained = drainExecutions({ provider, taskExecutor: executor });
    await waitFor(async () => (await taskStatus("Checkout API", execution.id)) === "running");

    const asked = await cancelExecution(owner, slug, execution.id);
    // A worker still holds the backend task: we do not claim it stopped.
    expect(asked.status).toBe("cancelling");
    expect(await taskStatus("Checkout API", execution.id)).toBe("running");
    expect(await taskStatus("Checkout page", execution.id)).toBe("cancelled");
    expect(await taskStatus("Verify checkout", execution.id)).toBe("cancelled");

    hold.open();
    await drained;
    expect(await executionStatus(execution.id)).toBe("cancelled");
    expect(await taskStatus("Checkout API", execution.id)).toBe("cancelled");
    expect(calls.map((c) => c.definition.role)).toEqual(["backend"]);
    // The commit really happened, so it is still on record even though the task was stopped.
    const made = await db
      .select()
      .from(executionArtifacts)
      .where(eq(executionArtifacts.executionId, execution.id));
    expect(made.filter((a) => a.kind === "commit")).toHaveLength(1);
    const [run] = await runsOf(execution.id, "Checkout API");
    expect(run.status).toBe("cancelled");
  });

  it("cancels a plan that was not built straight away, and is safe to ask twice", async () => {
    const { provider } = fakePlanner(PLAN);
    const { executor } = scripted();
    const { id } = await runToEnd(
      owner,
      slug,
      { mode: "plan", request: "Plan" },
      { provider, taskExecutor: executor },
    );
    expect((await cancelExecution(owner, slug, id)).status).toBe("cancelled");
    expect((await cancelExecution(owner, slug, id)).status).toBe("cancelled");
    expect(await code(buildFromPlan(owner, slug, id))).toBe("CONFLICT");
  });

  it("drops a plan that arrives after the execution was cancelled", async () => {
    const hold = gate();
    const planner = fakePlanner(PLAN);
    const slow = {
      ...planner.provider,
      generateObject: async (...args: Parameters<typeof planner.provider.generateObject>) => {
        await hold.opened;
        return planner.provider.generateObject(...args);
      },
    } as typeof planner.provider;
    const { executor } = scripted();
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build" });
    const drained = drainExecutions({ provider: slow, taskExecutor: executor });
    await waitFor(async () => (await executionStatus(execution.id)) === "planning");
    expect((await cancelExecution(owner, slug, execution.id)).status).toBe("cancelling");
    hold.open();
    await drained;
    expect(await executionStatus(execution.id)).toBe("cancelled");
    const made = await db.select().from(tasks).where(eq(tasks.executionId, execution.id));
    expect(made.filter((t) => t.phase !== "plan")).toEqual([]);
  });
});

describe("retrying", () => {
  it("tries a failed task again after a delay, and the second try knows why the first failed", async () => {
    const { provider } = fakePlanner(PLAN);
    let failed = false;
    const { executor, calls } = scripted({
      backend: async (input) => {
        if (!failed) {
          failed = true;
          return { outcome: "failed", error: "provider returned 503", retryable: true };
        }
        return {
          outcome: "succeeded",
          summary: "ok",
          artifacts: [{ kind: "commit", commitSha: `s-${input.attempt}`, summary: "api" }],
        };
      },
    });
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build" });
    await drainExecutions({ provider, taskExecutor: executor });
    // The retry waits out its delay: nothing else can run, and the execution is still going.
    expect(await executionStatus(execution.id)).toBe("running");
    expect(await taskStatus("Checkout API", execution.id)).toBe("queued");

    await drainExecutions({ provider, taskExecutor: executor, now: later });
    expect(await executionStatus(execution.id)).toBe("succeeded");
    const backend = calls.filter((c) => c.definition.role === "backend");
    expect(backend.map((c) => [c.attempt, c.previousError])).toEqual([
      [1, null],
      [2, "provider returned 503"],
    ]);
    const runs = await runsOf(execution.id, "Checkout API");
    expect(runs.map((r) => [r.attempt, r.status]).sort()).toEqual([
      [1, "failed"],
      [2, "completed"],
    ]);
  });

  it("gives up after the allowed attempts and reports the failure", async () => {
    const { provider } = fakePlanner(PLAN);
    const { executor, calls } = scripted({
      backend: async () => ({ outcome: "failed", error: "still down", retryable: true }),
    });
    const { view } = await runToEnd(
      owner,
      slug,
      { mode: "build", request: "Build" },
      { provider, taskExecutor: executor },
      later,
    );
    expect(calls.filter((c) => c.definition.role === "backend")).toHaveLength(3);
    expect(view.execution.status).toBe("failed");
    expect(view.tasks.find((t) => t.title === "Checkout API")).toMatchObject({
      status: "failed",
      attempts: 3,
    });
    // What waited for it is held, with the reason, not left pending.
    expect(view.tasks.find((t) => t.title === "Checkout page")).toMatchObject({
      status: "blocked",
      blockedReason: "dependency_failed",
    });
  });

  it("does not retry an error that cannot get better", async () => {
    const { provider } = fakePlanner(PLAN);
    const { executor, calls } = scripted({
      backend: async () => ({ outcome: "failed", error: "refused", retryable: false }),
    });
    await runToEnd(
      owner,
      slug,
      { mode: "build", request: "Build" },
      { provider, taskExecutor: executor },
      later,
    );
    expect(calls.filter((c) => c.definition.role === "backend")).toHaveLength(1);
  });

  it("resumes after a person retries, without repeating the work that already succeeded", async () => {
    const { provider } = fakePlanner(PLAN);
    let broken = true;
    const { executor, calls } = scripted({
      frontend: async () =>
        broken
          ? { outcome: "failed", error: "build failed", retryable: false }
          : {
              outcome: "succeeded",
              summary: "ui",
              artifacts: [{ kind: "commit", commitSha: "ui-sha", summary: "ui" }],
            },
    });
    const { id, view } = await runToEnd(
      owner,
      slug,
      { mode: "build", request: "Build" },
      { provider, taskExecutor: executor },
    );
    expect(view.execution.status).toBe("failed");
    expect(view.execution.errorSummary).toBe("tasks_failed");
    const ui = view.tasks.find((t) => t.title === "Checkout page");
    expect(ui?.status).toBe("failed");

    broken = false;
    await retryTask(owner, slug, id, ui?.id ?? "");
    expect(await executionStatus(id)).toBe("running");
    await drainExecutions({ provider, taskExecutor: executor });
    expect(await executionStatus(id)).toBe("succeeded");
    // The backend task was done and stays done: it ran once. Its commit is not repeated.
    expect(calls.filter((c) => c.definition.role === "backend")).toHaveLength(1);
    const commits = await db
      .select()
      .from(executionArtifacts)
      .where(and(eq(executionArtifacts.executionId, id), eq(executionArtifacts.kind, "commit")));
    expect(commits).toHaveLength(3);
    expect((await getExecutionView(owner, slug, id)).execution.errorSummary).toBeNull();
  });

  it("refuses to retry a task that is not failed or blocked", async () => {
    const { provider } = fakePlanner(PLAN);
    const { executor } = scripted();
    const { id, view } = await runToEnd(
      owner,
      slug,
      { mode: "build", request: "Build" },
      { provider, taskExecutor: executor },
    );
    expect(await code(retryTask(owner, slug, id, view.tasks[1].id))).toBe("CONFLICT");
  });
});

describe("limits on what a plan may be", () => {
  const failed = async (plan: unknown, expected: string) => {
    const { provider } = fakePlanner(plan);
    const { executor } = scripted();
    const { view } = await runToEnd(
      owner,
      slug,
      { mode: "build", request: "Build" },
      { provider, taskExecutor: executor },
    );
    expect(view.execution.status).toBe("failed");
    expect(view.execution.errorSummary).toContain(expected);
    // Nothing from the refused plan was created.
    expect(view.tasks.filter((t) => t.phase !== "plan")).toEqual([]);
  };
  const chain = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...PLAN.tasks[0],
      key: `t${i}`,
      title: `Task ${i}`,
      dependsOn: i ? [`t${i - 1}`] : [],
      targetPaths: [] as string[],
    }));

  it("rejects a dependency cycle", async () => {
    await failed(
      {
        ...PLAN,
        tasks: [
          { ...PLAN.tasks[0], dependsOn: ["ui"] },
          { ...PLAN.tasks[1], dependsOn: ["api"] },
        ],
      },
      "cycle",
    );
  });

  it("rejects a task that depends on itself, on a task that does not exist, or has an unknown owner", async () => {
    await failed({ ...PLAN, tasks: [{ ...PLAN.tasks[0], dependsOn: ["api"] }] }, "self_dependency");
  });

  it("rejects a plan that names a role no agent has", async () => {
    await failed({ ...PLAN, tasks: [{ ...PLAN.tasks[0], role: "wizard" }] }, "plan_invalid");
  });

  it("rejects more tasks than the budget and chains that are too long", async () => {
    await failed(
      { ...PLAN, tasks: chain(26).map((t) => ({ ...t, dependsOn: [] })) },
      "too_many_tasks",
    );
    await resetAndAgain();
    await failed({ ...PLAN, tasks: chain(8) }, "too_deep");
  });
  const resetAndAgain = async () => {
    await db.delete(executions);
  };

  it("asks the planner once more with what was wrong, and accepts a corrected plan", async () => {
    const { provider, seen } = fakePlanner(
      {
        ...PLAN,
        tasks: [
          { ...PLAN.tasks[0], dependsOn: ["ui"] },
          { ...PLAN.tasks[1], dependsOn: ["api"] },
        ],
      },
      PLAN,
    );
    const { executor } = scripted();
    const { view } = await runToEnd(
      owner,
      slug,
      { mode: "build", request: "Build" },
      { provider, taskExecutor: executor },
    );
    expect(view.execution.status).toBe("succeeded");
    expect(seen).toHaveLength(2);
    expect(seen[1].segments.find((s) => s.label === "fix")?.content).toContain("cycle");
  });

  it("caps how many executions a project can have open", async () => {
    for (let i = 0; i < MAX_OPEN_EXECUTIONS; i++)
      await startExecution(owner, slug, { mode: "plan", request: `Plan ${i}` });
    expect(await code(startExecution(owner, slug, { mode: "plan", request: "One more" }))).toBe(
      "CONFLICT",
    );
  });
});

describe("a plan that changes before it is built", () => {
  it("keeps the old version, supersedes its tasks and plans again", async () => {
    const small = { ...PLAN, tasks: [PLAN.tasks[0]] };
    const { provider } = fakePlanner(PLAN, small);
    const { executor } = scripted();
    const { id } = await runToEnd(
      owner,
      slug,
      { mode: "plan", request: "Plan" },
      { provider, taskExecutor: executor },
    );
    await revisePlan(owner, slug, id, { request: "Only the API, please" });
    await drainExecutions({ provider, taskExecutor: executor });
    const view = await getExecutionView(owner, slug, id);
    expect(view.execution).toMatchObject({
      status: "planned",
      planVersion: 2,
      request: "Only the API, please",
    });
    const current = view.tasks.filter((t) => t.planVersion === 2 && t.phase !== "plan");
    expect(current.map((t) => t.title)).toEqual(["Checkout API"]);
    const old = view.tasks.filter((t) => t.planVersion === 1 && t.phase !== "plan");
    expect(old.every((t) => t.status === "cancelled")).toBe(true);
    expect(view.progress.total).toBeLessThanOrEqual(2);
  });

  it("refuses to rewrite a plan that is already being built", async () => {
    const { provider } = fakePlanner(PLAN);
    const { executor } = scripted();
    const { id } = await runToEnd(
      owner,
      slug,
      { mode: "build", request: "Build" },
      { provider, taskExecutor: executor },
    );
    expect(await code(revisePlan(owner, slug, id, { request: "Change of mind" }))).toBe("CONFLICT");
  });
});

describe("agents the Owner changes while an execution runs", () => {
  const configOf = (d: Record<string, unknown>) =>
    Object.fromEntries(CONFIG_FIELDS.map((f) => [f, d[f]]));
  const definitionOf = async (key: string) =>
    (await listDefinitions(owner)).find((d) => d.key === key);

  it("never changes a running execution's instructions, but the next execution gets the new ones", async () => {
    const { provider } = fakePlanner(PLAN);
    const hold = gate();
    const { executor, calls } = scripted({
      backend: async () => {
        await hold.opened;
        return { outcome: "succeeded", summary: "ok", artifacts: [] };
      },
    });
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build" });
    const drained = drainExecutions({ provider, taskExecutor: executor });
    await waitFor(async () => (await taskStatus("Checkout API", execution.id)) === "running");

    const frontend = await definitionOf("frontend-developer");
    if (!frontend) throw new Error("missing preset");
    await updateDefinition(owner, frontend.id, {
      ...configOf(frontend),
      instructions: "NEW WORDING for the frontend agent.",
    });
    hold.open();
    await drained;
    const first = calls.find((c) => c.definition.role === "frontend");
    expect(first?.definition.instructions).not.toContain("NEW WORDING");
    expect(first?.definition.version).toBe(1);

    const again = scripted();
    await runToEnd(
      owner,
      slug,
      { mode: "build", request: "Again" },
      { provider, taskExecutor: again.executor },
    );
    const second = again.calls.find((c) => c.definition.role === "frontend");
    expect(second?.definition.instructions).toContain("NEW WORDING");
    expect(second?.definition.version).toBe(2);
  });

  it("gives no new task to an agent switched off mid-way, says why, and resumes when it is on again", async () => {
    const { provider } = fakePlanner(PLAN);
    const hold = gate();
    const { executor, calls } = scripted({
      backend: async () => {
        await hold.opened;
        return { outcome: "succeeded", summary: "ok", artifacts: [] };
      },
    });
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build" });
    const drained = drainExecutions({ provider, taskExecutor: executor });
    await waitFor(async () => (await taskStatus("Checkout API", execution.id)) === "running");
    const frontend = await definitionOf("frontend-developer");
    if (!frontend) throw new Error("missing preset");
    await setDefinitionStatus(owner, frontend.id, "inactive");
    hold.open();
    await drained;

    const view = await getExecutionView(owner, slug, execution.id);
    expect(calls.map((c) => c.definition.role)).toEqual(["backend"]);
    expect(view.tasks.find((t) => t.title === "Checkout page")).toMatchObject({
      status: "blocked",
      blockedReason: "no_agent:frontend",
    });
    expect(view.execution).toMatchObject({ status: "failed", errorSummary: "blocked" });
    expect(
      view.messages.some((m) => m.type === "blocker" && m.body.includes("agent registry")),
    ).toBe(true);

    await setDefinitionStatus(owner, frontend.id, "active");
    await retryTask(
      owner,
      slug,
      execution.id,
      view.tasks.find((t) => t.title === "Checkout page")?.id ?? "",
    );
    await drainExecutions({ provider, taskExecutor: executor });
    expect(await executionStatus(execution.id)).toBe("succeeded");
  });
});

describe("who may do what", () => {
  it("shows an execution only to members of its project", async () => {
    const stranger = await createUser("Stranger");
    const viewer = await createUser("Viewer");
    const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
    await db.insert(projectMembers).values({ projectId: p.id, userId: viewer.id, role: "viewer" });
    const otherSlug = await project(stranger, "A blog about travel photography with weekly posts");
    const { execution } = await seedExecution(owner, slug, { status: "running" });
    const { id } = execution;
    const before = await db.select().from(executions).where(eq(executions.id, id));

    expect(await code(startExecution(stranger, slug, { mode: "build", request: "Hijack" }))).toBe(
      "NOT_FOUND",
    );
    expect(await code(getExecutionView(stranger, slug, id))).toBe("NOT_FOUND");
    expect(await code(cancelExecution(stranger, slug, id))).toBe("NOT_FOUND");
    expect(await code(retryTask(stranger, slug, id, id))).toBe("NOT_FOUND");
    expect(await code(buildFromPlan(stranger, slug, id))).toBe("NOT_FOUND");
    expect(await code(revisePlan(stranger, slug, id, { request: "x y z" }))).toBe("NOT_FOUND");
    expect(await code(listExecutions(stranger, slug))).toBe("NOT_FOUND");
    // The right id through someone else's project is just as unknown.
    expect(await code(getExecutionView(stranger, otherSlug, id))).toBe("NOT_FOUND");
    expect(await code(cancelExecution(stranger, otherSlug, id))).toBe("NOT_FOUND");
    // A viewer may look but not start or stop work.
    expect((await getExecutionView(viewer, slug, id)).execution.id).toBe(id);
    expect(await code(startExecution(viewer, slug, { mode: "build", request: "Try" }))).toBe(
      "AUTHORIZATION_ERROR",
    );
    expect(await code(cancelExecution(viewer, slug, id))).toBe("AUTHORIZATION_ERROR");
    expect(await code(retryTask(viewer, slug, id, id))).toBe("AUTHORIZATION_ERROR");
    expect(await db.select().from(executions).where(eq(executions.id, id))).toEqual(before);
  });

  it("does not let a conversation of another person be attached", async () => {
    const other = await createUser("Other");
    const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
    await db.insert(projectMembers).values({ projectId: p.id, userId: other.id, role: "editor" });
    const { conversations } = await import("@/lib/db/schema");
    const [theirs] = await db
      .insert(conversations)
      .values({ projectId: p.id, userId: other.id, title: "Private" })
      .returning();
    expect(
      await code(
        startExecution(owner, slug, { mode: "plan", request: "Plan", conversationId: theirs.id }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("stops a worker from acting for someone who left the project", async () => {
    const editor = await createUser("Editor");
    const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
    await db.insert(projectMembers).values({ projectId: p.id, userId: editor.id, role: "editor" });
    const execution = await startExecution(editor, slug, { mode: "build", request: "Build" });
    await db.delete(projectMembers).where(eq(projectMembers.userId, editor.id));
    const { provider } = fakePlanner(PLAN);
    const { executor, calls } = scripted();
    await drainExecutions({ provider, taskExecutor: executor });
    expect(calls).toEqual([]);
    expect(await executionStatus(execution.id)).toBe("failed");
  });
});

describe("workers", () => {
  it("runs every task once even when two workers drain at the same time", async () => {
    const { provider } = fakePlanner(PLAN);
    const { executor, calls } = scripted();
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build" });
    await Promise.all([
      drainExecutions({ provider, taskExecutor: executor }),
      drainExecutions({ provider, taskExecutor: executor }),
    ]);
    expect(calls.map((c) => c.definition.role).sort()).toEqual(["backend", "frontend", "qa"]);
    expect(await executionStatus(execution.id)).toBe("succeeded");
  });

  it("takes over a job whose worker died, and counts that try as failed", async () => {
    const { provider } = fakePlanner(PLAN);
    const stuck = gate();
    const dying = scripted({
      backend: async () => {
        await stuck.opened;
        return {
          outcome: "succeeded",
          summary: "late",
          artifacts: [{ kind: "commit", commitSha: "late", summary: "late" }],
        };
      },
    });
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build" });
    const first = drainExecutions({ provider, taskExecutor: dying.executor });
    await waitFor(async () => (await taskStatus("Checkout API", execution.id)) === "running");
    // The worker is gone: its lock runs out.
    await db
      .update(executionJobs)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(executionJobs.status, "running"));

    const healthy = scripted();
    await drainExecutions({ provider, taskExecutor: healthy.executor, now: later });
    expect(await executionStatus(execution.id)).toBe("succeeded");
    const runs = await runsOf(execution.id, "Checkout API");
    expect(runs.map((r) => [r.attempt, r.status, r.error]).sort()).toEqual([
      [1, "failed", "worker_lost"],
      [2, "completed", null],
    ]);

    // The dead worker finally answers: its late result changes nothing.
    stuck.open();
    await first;
    const commits = await db
      .select()
      .from(executionArtifacts)
      .where(
        and(
          eq(executionArtifacts.executionId, execution.id),
          eq(executionArtifacts.commitSha, "late"),
        ),
      );
    expect(commits).toEqual([]);
    expect(await taskStatus("Checkout API", execution.id)).toBe("succeeded");
  });

  it("queues one job for the same step, however many times it is asked", async () => {
    const { execution, projectId } = await seedExecution(owner, slug);
    const input = {
      projectId,
      executionId: execution.id,
      kind: "dispatch" as const,
      key: "dispatch:1",
    };
    expect(await enqueueJob(db, input)).toBe(true);
    expect(await enqueueJob(db, input)).toBe(false);
    expect(
      await db.select().from(executionJobs).where(eq(executionJobs.executionId, execution.id)),
    ).toHaveLength(1);
  });
});

describe("duplicates", () => {
  it("stores one message and one event when the same message is sent twice", async () => {
    const { execution, projectId } = await seedExecution(owner, slug);
    const scope = { executionId: execution.id, projectId };
    const send = () =>
      db.transaction((tx) =>
        postMessage(tx, scope, {
          from: null,
          to: null,
          type: "decision",
          body: "Use REST.",
          key: "decision:1",
        }),
      );
    expect((await send()).created).toBe(true);
    expect((await send()).created).toBe(false);
    expect(
      await db.select().from(agentMessages).where(eq(agentMessages.executionId, execution.id)),
    ).toHaveLength(1);
    const events = await db
      .select()
      .from(executionEvents)
      .where(eq(executionEvents.executionId, execution.id));
    expect(events.filter((e) => e.type === "agent.message_created")).toHaveLength(1);
  });

  it("refuses to fill an execution with messages without end", async () => {
    const { execution, projectId } = await seedExecution(owner, slug);
    const scope = { executionId: execution.id, projectId };
    await db.insert(agentMessages).values(
      Array.from({ length: 400 }, (_, i) => ({
        projectId,
        executionId: execution.id,
        type: "decision" as const,
        body: "x",
        idempotencyKey: `seed:${i}`,
      })),
    );
    expect(
      await code(
        db.transaction((tx) =>
          postMessage(tx, scope, {
            from: null,
            to: null,
            type: "decision",
            body: "one more",
            key: "more",
          }),
        ),
      ),
    ).toBe("CONFLICT");
  });
});
