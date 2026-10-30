import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import {
  agentMessages,
  agentRuns,
  executionArtifacts,
  executionEvents,
  executions,
  taskDependencies,
  tasks,
} from "@/lib/db/schema";
import { buildFromPlan, startExecution } from "@/lib/executions/service";
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
import { project } from "../helpers/project";

let owner: Actor;
let slug: string;
beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  slug = await project(owner, "An online shop selling handmade candles to local customers");
});

describe("planning", () => {
  it("turns a request into a valid task graph with an owner role and criteria for every task", async () => {
    const { provider, seen } = fakePlanner(PLAN);
    const { executor } = scripted();
    const { view } = await runToEnd(
      owner,
      slug,
      { mode: "plan", request: "Add a checkout to the shop" },
      { provider, taskExecutor: executor },
    );
    expect(view.execution.status).toBe("planned");
    expect(view.execution.plan).toMatchObject({ goal: "Add a checkout" });

    const work = view.tasks.filter((t) => t.phase !== "plan");
    expect(work.map((t) => [t.title, t.roleKey, t.status])).toEqual([
      ["Checkout API", "backend", "pending"],
      ["Checkout page", "frontend", "pending"],
      ["Verify checkout", "qa", "pending"],
    ]);
    expect(work.every((t) => t.acceptanceCriteria.length > 0)).toBe(true);
    const api = work.find((t) => t.title === "Checkout API");
    const ui = work.find((t) => t.title === "Checkout page");
    expect(ui?.dependsOn).toEqual([api?.id]);
    expect(work.find((t) => t.title === "Verify checkout")?.dependsOn.sort()).toEqual(
      [api?.id, ui?.id].sort(),
    );
    // The planner itself is a task, so its work shows up and is counted.
    expect(view.tasks.find((t) => t.phase === "plan")?.status).toBe("succeeded");
    // Project text reached the model as data, the roles as instructions.
    const kinds = Object.fromEntries(seen[0].segments.map((s) => [s.label, s.kind]));
    expect(kinds.request).toBe("project_data");
    expect(kinds["repository root"]).toBe("external");
    expect(kinds.roles).toBe("instruction");
  });

  it("does not build anything in plan mode, and builds when asked", async () => {
    const { provider } = fakePlanner(PLAN);
    const { executor, calls } = scripted();
    const { id } = await runToEnd(
      owner,
      slug,
      { mode: "plan", request: "Add a checkout" },
      { provider, taskExecutor: executor },
    );
    expect(calls).toHaveLength(0);
    expect(await executionStatus(id)).toBe("planned");

    await buildFromPlan(owner, slug, id);
    await drainExecutions({ provider, taskExecutor: executor });
    const view = await getExecutionView(owner, slug, id);
    expect(view.execution.status).toBe("succeeded");
    expect(view.execution.branch).toBe(`saqina/exec-${id.slice(0, 8)}`);
    expect(calls.map((c) => c.definition.role)).toEqual(["backend", "frontend", "qa"]);
  });

  it("starts working by itself in build mode, with no click on any agent", async () => {
    const { provider } = fakePlanner(PLAN);
    const { executor, calls } = scripted();
    const { view } = await runToEnd(
      owner,
      slug,
      { mode: "build", request: "Build the checkout" },
      { provider, taskExecutor: executor },
    );
    expect(view.execution.status).toBe("succeeded");
    expect(calls).toHaveLength(3);
    expect(view.progress).toEqual({ done: 3, total: 3 });
  });

  it("stops with the real reason when no model is set up, and never pretends", async () => {
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build it" });
    await drainExecutions();
    const [row] = await db.select().from(executions).where(eq(executions.id, execution.id));
    expect(row.status).toBe("failed");
    expect(row.errorSummary).toBe("no_model");
    const made = await db.select().from(tasks).where(eq(tasks.executionId, execution.id));
    expect(made.filter((t) => t.phase !== "plan")).toEqual([]);
  });
});

describe("dependencies", () => {
  it("does not start a task before the tasks it depends on have succeeded", async () => {
    const { provider } = fakePlanner(PLAN);
    const hold = gate();
    const { executor, calls } = scripted({
      backend: async (input) => {
        await hold.opened;
        return {
          outcome: "succeeded",
          summary: "api done",
          artifacts: [{ kind: "commit", commitSha: `sha-${input.task.id}`, summary: "api" }],
        };
      },
    });
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build" });
    const drained = drainExecutions({ provider, taskExecutor: executor });
    await waitFor(async () => (await taskStatus("Checkout API", execution.id)) === "running");

    // The backend task is running: nothing that waits for it may have started, or even been given an agent.
    expect(await taskStatus("Checkout page", execution.id)).toBe("pending");
    expect(await taskStatus("Verify checkout", execution.id)).toBe("pending");
    expect(calls.map((c) => c.definition.role)).toEqual(["backend"]);
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.executionId, execution.id));
    expect(runs.filter((r) => r.status === "running")).toHaveLength(1);

    hold.open();
    await drained;
    expect(calls.map((c) => c.definition.role)).toEqual(["backend", "frontend", "qa"]);
    expect(await executionStatus(execution.id)).toBe("succeeded");
  });

  it("runs independent tasks side by side, up to the parallel limit", async () => {
    const flat = {
      ...PLAN,
      tasks: PLAN.tasks.map((t) => ({ ...t, dependsOn: [], targetPaths: [`src/${t.key}`] })),
    };
    const { provider } = fakePlanner(flat);
    const hold = gate();
    let running = 0;
    let peak = 0;
    const { executor } = scripted({
      backend: async () => {
        running++;
        peak = Math.max(peak, running);
        await hold.opened;
        running--;
        return { outcome: "succeeded", summary: "ok", artifacts: [] };
      },
      frontend: async () => {
        running++;
        peak = Math.max(peak, running);
        await hold.opened;
        running--;
        return { outcome: "succeeded", summary: "ok", artifacts: [] };
      },
    });
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build" });
    const drained = drainExecutions({ provider, taskExecutor: executor });
    await waitFor(async () => peak === 2);
    hold.open();
    await drained;
    expect(peak).toBe(2);
    expect(await executionStatus(execution.id)).toBe("succeeded");
  });

  it("serialises tasks that write the same file", async () => {
    const clash = {
      ...PLAN,
      tasks: [
        { ...PLAN.tasks[0], key: "a", dependsOn: [], targetPaths: ["src/shared.ts"] },
        { ...PLAN.tasks[1], key: "b", dependsOn: [], targetPaths: ["src/shared.ts"] },
      ],
    };
    const { provider } = fakePlanner(clash);
    const hold = gate();
    const { executor } = scripted({
      backend: async () => {
        await hold.opened;
        return { outcome: "succeeded", summary: "a", artifacts: [] };
      },
    });
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build" });
    const drained = drainExecutions({ provider, taskExecutor: executor });
    await waitFor(async () => (await taskStatus("Checkout API", execution.id)) === "running");
    expect(await taskStatus("Checkout page", execution.id)).toBe("pending");
    const notes = await db
      .select()
      .from(agentMessages)
      .where(and(eq(agentMessages.executionId, execution.id), eq(agentMessages.type, "conflict")));
    expect(notes).toHaveLength(1);
    hold.open();
    await drained;
    expect(await executionStatus(execution.id)).toBe("succeeded");
  });
});

describe("what an agent is given and what it leaves", () => {
  it("gives the next agent the work of the agents before it, and its own instructions", async () => {
    const { provider } = fakePlanner(PLAN);
    const { executor, calls } = scripted();
    await runToEnd(
      owner,
      slug,
      { mode: "build", request: "Build" },
      { provider, taskExecutor: executor },
    );

    const ui = calls.find((c) => c.definition.role === "frontend");
    expect(ui?.inputs.map((i) => i.title)).toEqual(["Checkout API"]);
    expect(ui?.inputs[0].summary).toBe("Checkout API done");
    expect(ui?.inputs[0].artifacts[0]).toMatchObject({ kind: "commit" });
    expect(ui?.definition.instructions).toMatch(/interface code/);
    expect(ui?.task.acceptanceCriteria).toEqual(["The page shows an error when the call fails"]);

    // The backend agent starts with nothing from others; QA gets both.
    expect(calls.find((c) => c.definition.role === "backend")?.inputs).toEqual([]);
    expect(
      calls
        .find((c) => c.definition.role === "qa")
        ?.inputs.map((i) => i.title)
        .sort(),
    ).toEqual(["Checkout API", "Checkout page"]);
  });

  it("stores what an agent produced and announces it as events", async () => {
    const { provider } = fakePlanner(PLAN);
    const { executor } = scripted();
    const { id } = await runToEnd(
      owner,
      slug,
      { mode: "build", request: "Build" },
      { provider, taskExecutor: executor },
    );
    const made = await db
      .select()
      .from(executionArtifacts)
      .where(eq(executionArtifacts.executionId, id));
    expect(made.filter((a) => a.kind === "commit")).toHaveLength(3);
    const types = (
      await db.select().from(executionEvents).where(eq(executionEvents.executionId, id))
    ).map((e) => e.type);
    for (const t of [
      "execution.created",
      "execution.started",
      "task.created",
      "task.started",
      "task.completed",
      "agent.status_changed",
      "agent.message_created",
      "artifact.created",
      "git.operation_completed",
      "code.diff_updated",
      "execution.completed",
    ])
      expect(types, t).toContain(t);
  });

  it("derives each agent's status from its tasks, as they happen", async () => {
    const { provider } = fakePlanner(PLAN);
    const hold = gate();
    const { executor } = scripted({
      backend: async () => {
        await hold.opened;
        return { outcome: "succeeded", summary: "ok", artifacts: [] };
      },
    });
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build" });
    const drained = drainExecutions({ provider, taskExecutor: executor });
    await waitFor(async () => (await taskStatus("Checkout API", execution.id)) === "running");
    const view = await getExecutionView(owner, slug, execution.id);
    const by = (role: string) => view.agents.find((a) => a.role === role);
    expect(by("backend")).toMatchObject({ status: "running", taskTitle: "Checkout API" });
    expect(by("frontend")?.status).toBe("waiting_agent");
    expect(by("qa")?.status).toBe("waiting_agent");
    expect(by("devops")?.status).toBe("idle");
    expect(view.progress.done).toBe(0); // the planning task is not counted
    hold.open();
    await drained;
    const done = await getExecutionView(owner, slug, execution.id);
    expect(done.agents.find((a) => a.role === "backend")?.status).toBe("succeeded");
  });
});

describe("handoff and messages between agents", () => {
  it("delivers a message to an agent the sender may hand work to, and refuses one it may not", async () => {
    const { provider } = fakePlanner(PLAN);
    const { executor } = scripted({
      backend: async () => ({
        outcome: "succeeded",
        summary: "api done",
        artifacts: [],
        messages: [
          {
            to: "qa-engineer",
            type: "review_request",
            body: "Please check the checkout endpoint.",
          },
          { to: "devops-engineer", type: "handoff", body: "Take over the release." },
        ],
      }),
    });
    const { id, view } = await runToEnd(
      owner,
      slug,
      { mode: "build", request: "Build" },
      { provider, taskExecutor: executor },
    );
    const sent = view.messages.filter((m) => m.type === "review_request");
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toBe("Please check the checkout endpoint.");
    expect(view.messages.some((m) => m.body.includes("Take over the release"))).toBe(false);

    const events = await db
      .select()
      .from(executionEvents)
      .where(eq(executionEvents.executionId, id));
    expect(events.some((e) => e.type === "agent.handoff_created")).toBe(true);
    expect(
      events.find((e) => (e.payload as { warning?: string }).warning === "handoff_refused"),
    ).toBeDefined();
  });

  it("sends review findings back to the author, who revises, and the review runs again", async () => {
    const { provider } = fakePlanner(PLAN);
    let reviews = 0;
    const { executor, calls } = scripted({
      qa: async (input) => {
        reviews++;
        if (reviews === 1) {
          const api = calls.find((c) => c.definition.role === "backend");
          return {
            outcome: "review_failed",
            summary: "Criterion 1 fails",
            findings: "POST /checkout accepts an empty cart. Reproduce: send {}.",
            targetTaskId: api?.task.id ?? "",
          };
        }
        return { outcome: "succeeded", summary: `ok ${input.task.title}`, artifacts: [] };
      },
    });
    const { view } = await runToEnd(
      owner,
      slug,
      { mode: "build", request: "Build" },
      { provider, taskExecutor: executor },
    );
    expect(view.execution.status).toBe("succeeded");
    const titles = view.tasks.map((t) => t.title);
    expect(titles).toContain("Revise: Checkout API");
    expect(titles).toContain("Re-check: Verify checkout");

    const feedback = view.messages.find((m) => m.type === "review_feedback");
    expect(feedback?.body).toContain("accepts an empty cart");
    // The revising agent was given those findings as input.
    const revise = calls.find((c) => c.task.title === "Revise: Checkout API");
    expect(revise?.messages.some((m) => m.body.includes("accepts an empty cart"))).toBe(true);
    expect(revise?.task.parentTaskId).toBeTruthy();
    expect(reviews).toBe(2);
  });

  it("stops a review loop that never converges, and fails honestly", async () => {
    const { provider } = fakePlanner(PLAN);
    const { executor, calls } = scripted({
      qa: async () => ({
        outcome: "review_failed",
        summary: "Still wrong",
        findings: "Still broken.",
        targetTaskId: calls.find((c) => c.definition.role === "backend")?.task.id ?? "",
      }),
    });
    const { view } = await runToEnd(
      owner,
      slug,
      { mode: "build", request: "Build" },
      { provider, taskExecutor: executor },
    );
    expect(view.execution.status).toBe("failed");
    // 1 plan + 3 planned + 2 revisions x (revise + re-check) at most; never unbounded.
    expect(view.tasks.length).toBeLessThanOrEqual(view.execution.budget.maxTasks);
    expect(view.tasks.length).toBeLessThanOrEqual(8);
    expect(view.tasks.some((t) => t.blockedReason === "review_failed_no_budget")).toBe(true);
  });

  it("saves the dependency edges and keeps a task from depending on itself", async () => {
    const { provider } = fakePlanner(PLAN);
    const { executor } = scripted();
    const { id } = await runToEnd(
      owner,
      slug,
      { mode: "plan", request: "Plan" },
      { provider, taskExecutor: executor },
    );
    const edges = await db
      .select()
      .from(taskDependencies)
      .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
      .where(eq(tasks.executionId, id));
    expect(edges).toHaveLength(3);
    const [one] = await db.select().from(tasks).where(eq(tasks.executionId, id)).limit(1);
    await expect(
      db.insert(taskDependencies).values({ taskId: one.id, dependsOnId: one.id }),
    ).rejects.toThrow();
  });
});
