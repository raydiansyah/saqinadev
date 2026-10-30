import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { executionEvents } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { appendEvent, listEventsSince } from "@/lib/executions/events";
import { createUser, resetDatabase } from "../helpers/db";
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

describe("execution event log", () => {
  beforeEach(resetDatabase);

  it("numbers events one after another and replays them from a given number", async () => {
    const owner = await createUser("Owner");
    const { execution, projectId } = await seedExecution(
      owner,
      await project(owner, "An online shop selling handmade candles to local customers"),
    );
    const scope = { executionId: execution.id, projectId };
    expect((await appendEvent(db, scope, "execution.created")).seq).toBe(1);
    expect((await appendEvent(db, scope, "task.created", { title: "API" })).seq).toBe(2);
    expect((await appendEvent(db, scope, "task.started")).seq).toBe(3);

    const after1 = await listEventsSince(db, scope, 1);
    expect(after1.map((e) => [e.seq, e.type])).toEqual([
      [2, "task.created"],
      [3, "task.started"],
    ]);
    expect(await listEventsSince(db, scope, 3)).toEqual([]);
  });

  it("gives concurrent writers distinct, gap-free numbers", async () => {
    const owner = await createUser("Owner");
    const { execution, projectId } = await seedExecution(
      owner,
      await project(owner, "An online shop selling handmade candles to local customers"),
    );
    const scope = { executionId: execution.id, projectId };
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        db.transaction((tx) => appendEvent(tx, scope, "task.progress", { i })),
      ),
    );
    const rows = await db
      .select({ seq: executionEvents.seq })
      .from(executionEvents)
      .where(eq(executionEvents.executionId, execution.id));
    expect(rows.map((r) => r.seq).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it("refuses an execution that belongs to another project and writes nothing", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const { execution } = await seedExecution(
      alice,
      await project(alice, "An online shop selling handmade candles to local customers"),
    );
    const other = await seedExecution(
      bob,
      await project(bob, "A blog about travel photography with weekly posts"),
    );
    expect(
      await code(
        appendEvent(db, { executionId: execution.id, projectId: other.projectId }, "task.created"),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await db.select().from(executionEvents).where(eq(executionEvents.executionId, execution.id)),
    ).toEqual([]);
  });

  it("keeps secrets and very long text out of the log", async () => {
    const owner = await createUser("Owner");
    const { execution, projectId } = await seedExecution(
      owner,
      await project(owner, "An online shop selling handmade candles to local customers"),
    );
    const scope = { executionId: execution.id, projectId };
    const token = `ghp_${"a".repeat(36)}`;
    await appendEvent(db, scope, "task.failed", {
      error: `push failed with ${token}`,
      long: "x".repeat(5000),
    });
    const [row] = await listEventsSince(db, scope, 0);
    expect(JSON.stringify(row.payload)).not.toContain(token);
    expect((row.payload.long as string).length).toBeLessThan(2100);
  });
});
