import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { auditEvents, projectMembers, tasks } from "@/lib/db/schema";
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

  it("asks for the answer when every task is done, and flags a deploy that skips ahead", async () => {
    await addTask("done");
    await answerDeliveryCheck(owner, slug, { step: "deploy", done: true });
    const codes = (await overview()).notes.map((n) => n.code).sort();
    expect(codes).toEqual(["all_tasks_done", "needs_build_and_review"]);
    await answerDeliveryCheck(owner, slug, { step: "build", done: true });
    await answerDeliveryCheck(owner, slug, { step: "review", done: true });
    expect((await overview()).notes).toEqual([]);
  });
});
