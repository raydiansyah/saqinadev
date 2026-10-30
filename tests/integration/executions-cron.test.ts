import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/executions/route";
import { db } from "@/lib/db/client";
import { executionJobs, users } from "@/lib/db/schema";
import { startExecution } from "@/lib/executions/service";
import { createUser, resetDatabase } from "../helpers/db";
import { executionStatus } from "../helpers/engine";
import { project } from "../helpers/project";

const call = (auth?: string) =>
  GET(
    new Request("http://localhost/api/cron/executions", {
      headers: auth ? { authorization: auth } : {},
    }),
  );

describe("execution cron route", () => {
  const before = process.env.CRON_SECRET;
  beforeEach(async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    await resetDatabase();
  });
  afterEach(() => {
    process.env.CRON_SECRET = before;
  });

  it("refuses a caller without the secret and does nothing", async () => {
    const owner = await createUser("Owner");
    const slug = await project(owner, "An online shop selling handmade candles to local customers");
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build" });
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(
      (await db.select().from(executionJobs).where(eq(executionJobs.executionId, execution.id)))[0]
        .status,
    ).toBe("pending");
    expect(await executionStatus(execution.id)).toBe("queued");
  });

  it("refuses everyone when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer anything")).status).toBe(503);
  });

  it("works the due jobs when called with the secret", async () => {
    const owner = await createUser("Owner");
    await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
    const slug = await project(owner, "An online shop selling handmade candles to local customers");
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build" });
    const res = await call("Bearer test-cron-secret");
    expect(res.status).toBe(200);
    expect((await res.json()).handled).toBeGreaterThan(0);
    // No model is set up in tests, so the plan job ran and stopped with the real reason.
    expect(await executionStatus(execution.id)).toBe("failed");
  });
});
