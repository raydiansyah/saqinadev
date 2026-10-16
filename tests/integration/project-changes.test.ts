import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { projectChanges, projects } from "@/lib/db/schema";
import { createTask, updateTask } from "@/lib/tasks/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

let alice: Actor;
let slug: string;
let projectId: string;

const changes = () =>
  db
    .select()
    .from(projectChanges)
    .where(eq(projectChanges.projectId, projectId))
    .orderBy(asc(projectChanges.revision));

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  slug = await project(alice, "A web shop with login and payments for my bakery.");
  projectId = (await loadProjectAccess(alice, { slug }, "project:read")).project.id;
});

describe("project change outbox", () => {
  it("starts with the project's own records, so a new reader needs no scan", async () => {
    const types = (await changes()).map((c) => c.type);
    expect(types).toContain("memory.created");
    expect(types).toContain("decision.created");
    expect(types).toContain("document.created");
  });

  it("records each context change with the revision it produced", async () => {
    const before = (await changes()).length;
    const task = await createTask(alice, slug, { title: "Wire checkout" });
    await updateTask(alice, slug, { id: task.id, status: "done" });
    const rows = await changes();
    expect(rows.length).toBeGreaterThanOrEqual(before + 2);

    const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(rows.at(-1)?.revision).toBe(p.contextRevision);
    const revisions = rows.map((r) => r.revision);
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
    expect(new Set(revisions).size).toBe(revisions.length);
    expect(rows.every((r) => r.processedAt === null)).toBe(true);
  });

  it("does not record events that agents never read", async () => {
    const before = (await changes()).length;
    await db.transaction((tx) =>
      recordActivity(tx, {
        projectId,
        actorId: alice.id,
        type: "agent.started",
        entityType: "agent_run",
      }),
    );
    expect(await changes()).toHaveLength(before);
  });

  it("rolls back with the change it belongs to", async () => {
    const before = (await changes()).length;
    await expect(
      db.transaction(async (tx) => {
        await recordActivity(tx, {
          projectId,
          actorId: alice.id,
          type: "task.created",
          entityType: "task",
        });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await changes()).toHaveLength(before);
  });

  it("keeps the origin the caller names", async () => {
    await db.transaction((tx) =>
      recordActivity(tx, {
        projectId,
        actorId: null,
        type: "memory.created",
        entityType: "memory",
        metadata: { origin: "agent" },
      }),
    );
    expect((await changes()).at(-1)).toMatchObject({ origin: "agent", actorId: null });
  });
});
