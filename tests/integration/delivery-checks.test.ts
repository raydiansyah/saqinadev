import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { auditEvents, projectMembers, repositoryConnections, tasks } from "@/lib/db/schema";
import {
  answerDeliveryCheck,
  getDeliveryChecks,
  getDeliveryOverview,
} from "@/lib/delivery/service";
import { AppError } from "@/lib/errors";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

let owner: Actor;
let viewer: Actor;
let stranger: Actor;
let slug: string;
let projectId: string;

const checks = async () =>
  getDeliveryChecks(await loadProjectAccess(owner, { slug }, "project:read"));
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
  owner = await createUser("Owner", "owner@example.test");
  viewer = await createUser("Viewer", "viewer@example.test");
  stranger = await createUser("Stranger", "stranger@example.test");
  slug = await project(owner, "A point of sale for a small restaurant with table orders.");
  projectId = (await loadProjectAccess(owner, { slug }, "project:read")).project.id;
  await db.insert(projectMembers).values({ projectId, userId: viewer.id, role: "viewer" });
});

describe("delivery checks: build, review, deploy", () => {
  it("starts unanswered, in order", async () => {
    const list = await checks();
    expect(list.map((c) => c.step)).toEqual(["build", "review", "deploy"]);
    expect(list.every((c) => c.unanswered && !c.done && !c.stale)).toBe(true);
  });

  it("records who answered and when, and a later answer replaces the earlier one", async () => {
    await answerDeliveryCheck(owner, slug, { step: "build", done: true });
    let build = (await checks()).find((c) => c.step === "build");
    expect(build).toMatchObject({ unanswered: false, done: true, answeredBy: "Owner" });
    expect(build?.answeredAt).toBeInstanceOf(Date);
    await answerDeliveryCheck(owner, slug, { step: "build", done: false });
    build = (await checks()).find((c) => c.step === "build");
    expect(build?.done).toBe(false);
    const audit = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.type, "delivery.answered"));
    expect(audit).toHaveLength(2);
  });

  it("asks for a new confirmation when tasks change after the answer", async () => {
    await answerDeliveryCheck(owner, slug, { step: "deploy", done: true });
    expect((await checks()).find((c) => c.step === "deploy")?.stale).toBe(false);
    await db.insert(tasks).values({
      projectId,
      title: "A change after the deploy answer",
      description: "",
      priority: "medium",
      status: "todo",
      source: "user",
      position: 0,
    });
    expect((await checks()).find((c) => c.step === "deploy")?.stale).toBe(true);
    // Answering again confirms it is current.
    await answerDeliveryCheck(owner, slug, { step: "deploy", done: true });
    expect((await checks()).find((c) => c.step === "deploy")?.stale).toBe(false);
  });

  it("is refused for a viewer, hidden from a stranger, and rejects an unknown step", async () => {
    expect(await code(answerDeliveryCheck(viewer, slug, { step: "build", done: true }))).toBe(
      "AUTHORIZATION_ERROR",
    );
    expect(await code(answerDeliveryCheck(stranger, slug, { step: "build", done: true }))).toBe(
      "NOT_FOUND",
    );
    expect(await code(answerDeliveryCheck(owner, slug, { step: "ship", done: true }))).toBe(
      "VALIDATION_ERROR",
    );
  });
});

describe("delivery checks against the plan", () => {
  // The project starts with generated tasks; these tests need to know exactly what is in the plan.
  beforeEach(async () => {
    await db.delete(tasks).where(eq(tasks.projectId, projectId));
  });

  const addTask = (status: "todo" | "review" | "done") =>
    db.insert(tasks).values({
      projectId,
      title: `Task ${status}`,
      description: "",
      priority: "medium",
      status,
      source: "user",
      position: 0,
    });
  const overview = async () =>
    getDeliveryOverview(await loadProjectAccess(owner, { slug }, "project:read"));

  it("counts the plan and warns when a yes disagrees with it", async () => {
    await addTask("done");
    await addTask("todo");
    await addTask("review");
    await answerDeliveryCheck(owner, slug, { step: "build", done: true });
    await answerDeliveryCheck(owner, slug, { step: "review", done: true });
    await answerDeliveryCheck(owner, slug, { step: "deploy", done: true });
    const o = await overview();
    expect(o.tasks).toEqual({ total: 3, done: 1, review: 1, open: 1 });
    expect(o.notes.map((n) => n.code).sort()).toEqual(["open_tasks", "tasks_in_review"]);
  });

  it("asks for the answer when every task is done, and a deploy answer settles build and review", async () => {
    await addTask("done");
    await answerDeliveryCheck(owner, slug, { step: "build", done: false });
    expect((await overview()).notes.map((n) => n.code)).toEqual(["all_tasks_done"]);
    // Deployed means built and reviewed too, so nothing is left to flag.
    await answerDeliveryCheck(owner, slug, { step: "deploy", done: true });
    expect((await overview()).notes).toEqual([]);
  });
});

describe("answers that settle each other and the plan", () => {
  const seed = async () => {
    await db.delete(tasks).where(eq(tasks.projectId, projectId));
    for (const status of ["done", "todo", "in_progress", "review", "blocked"] as const)
      await db.insert(tasks).values({
        projectId,
        title: `Task ${status}`,
        description: "",
        priority: "medium",
        status,
        source: "user",
        position: 0,
      });
  };
  const statuses = async () =>
    (await db.select({ s: tasks.status }).from(tasks).where(eq(tasks.projectId, projectId)))
      .map((r) => r.s)
      .sort();
  const answers = async () =>
    Object.fromEntries((await checks()).map((c) => [c.step, c.unanswered ? null : c.done]));

  it("deployed answers build and review as yes too, and with adjustment every task is done", async () => {
    await seed();
    const moved = await answerDeliveryCheck(owner, slug, {
      step: "deploy",
      done: true,
      adjustTasks: true,
    });
    expect(moved).toEqual({ toReview: 0, toDone: 4 });
    expect(await answers()).toEqual({ build: true, review: true, deploy: true });
    expect(await statuses()).toEqual(["done", "done", "done", "done", "done"]);
    // The adjustment is part of the answer: it does not make the answer look out of date.
    expect((await checks()).some((c) => c.stale)).toBe(false);
  });

  it("an earlier answer is not out of date because a later one moved the tasks", async () => {
    await seed();
    await answerDeliveryCheck(owner, slug, { step: "build", done: true });
    await answerDeliveryCheck(owner, slug, { step: "deploy", done: true, adjustTasks: true });
    expect((await checks()).map((c) => c.stale)).toEqual([false, false, false]);
  });

  it("built only moves the open tasks to review and leaves done ones alone", async () => {
    await seed();
    const moved = await answerDeliveryCheck(owner, slug, {
      step: "build",
      done: true,
      adjustTasks: true,
    });
    expect(moved).toEqual({ toReview: 3, toDone: 0 });
    expect(await statuses()).toEqual(["done", "review", "review", "review", "review"]);
  });

  it("without adjustment only the answers change", async () => {
    await seed();
    const moved = await answerDeliveryCheck(owner, slug, { step: "review", done: true });
    expect(moved).toEqual({ toReview: 0, toDone: 0 });
    expect(await answers()).toEqual({ build: true, review: true, deploy: null });
    expect(await statuses()).toEqual(["blocked", "done", "in_progress", "review", "todo"]);
  });

  it("not built clears the later answers and never reopens a task", async () => {
    await seed();
    await answerDeliveryCheck(owner, slug, { step: "deploy", done: true, adjustTasks: true });
    await answerDeliveryCheck(owner, slug, { step: "build", done: false, adjustTasks: true });
    expect(await answers()).toEqual({ build: false, review: false, deploy: false });
    expect(await statuses()).toEqual(["done", "done", "done", "done", "done"]);
  });

  it("an imported project waits for the first answer, then stops waiting", async () => {
    await db.insert(repositoryConnections).values({
      projectId,
      provider: "github",
      fullName: "acme/learning",
      status: "connected",
      docSyncEnabled: true,
      docSyncMode: "pull_only",
    });
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    expect((await getDeliveryOverview(access)).awaiting).toBe(true);
    await answerDeliveryCheck(owner, slug, { step: "build", done: false });
    expect((await getDeliveryOverview(access)).awaiting).toBe(false);
  });

  it("a project that did not come from GitHub never waits", async () => {
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    expect((await getDeliveryOverview(access)).awaiting).toBe(false);
  });
});
