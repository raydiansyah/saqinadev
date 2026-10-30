import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONFIG_FIELDS } from "@/lib/agent-definitions/input";
import { listDefinitions, updateDefinition } from "@/lib/agent-definitions/service";
import { createModel, createProvider, setDefaults } from "@/lib/ai/control-plane";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { aiUsageRecords, executionArtifacts, toolExecutions, users } from "@/lib/db/schema";
import { startExecution } from "@/lib/executions/service";
import { getExecutionView } from "@/lib/executions/view";
import { drainExecutions } from "@/lib/executions/worker";
import { connectRepository } from "@/lib/git/service";
import { startDevAiServer } from "../../scripts/dev-ai-server";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const KEY = "dev-mock-key-0000";
let server: Server;
let owner: Actor;
let slug: string;
let repo: string;
let defaultModel: string;
let pinnedModel: string;
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

beforeAll(async () => {
  await resetDatabase();
  server = await startDevAiServer(0, KEY);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  owner = await createUser("Owner");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
  const { id: providerId } = await createProvider(owner, {
    name: "Dev mock",
    type: "custom",
    adapter: "openai_compatible",
    baseUrl: base,
    secret: KEY,
  });
  const caps = ["text", "structured_output", "streaming", "tool_calling", "coding"];
  defaultModel = (
    await createModel(owner, {
      providerId,
      modelId: "saqina-dev-mock",
      displayName: "Default",
      capabilities: caps,
    })
  ).id;
  pinnedModel = (
    await createModel(owner, {
      providerId,
      modelId: "saqina-dev-mock-pinned",
      displayName: "Pinned",
      capabilities: caps,
    })
  ).id;
  await setDefaults(owner, { defaultModelId: defaultModel, fallbackModelId: null });

  repo = mkdtempSync(join(tmpdir(), "saqina-provider-repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  writeFileSync(join(repo, "README.md"), "# Shop\n");
  git("add", ".");
  git("-c", "user.name=T", "-c", "user.email=t@example.test", "commit", "-q", "-m", "init");
  slug = await project(owner, "An online shop selling handmade candles to local customers");
  await connectRepository(owner, slug, { provider: "custom_local", fullName: repo });
});

afterAll(async () => {
  server?.close();
  await resetDatabase();
});

describe("the whole engine through the real provider pipeline", () => {
  it("plans with the configured model, writes code with it and commits for real", async () => {
    const mainBefore = git("rev-parse", "main");
    // Pin the backend agent to its own model: the call it makes must use that one.
    const backend = (await listDefinitions(owner)).find((d) => d.key === "backend-developer");
    if (!backend) throw new Error("missing preset");
    await updateDefinition(owner, backend.id, {
      ...Object.fromEntries(CONFIG_FIELDS.map((f) => [f, (backend as Record<string, unknown>)[f]])),
      modelId: pinnedModel,
    });

    const execution = await startExecution(owner, slug, {
      mode: "build",
      request: "Add a wishlist",
    });
    await drainExecutions({});
    const view = await getExecutionView(owner, slug, execution.id);
    expect(view.execution.status).toBe("succeeded");
    expect(view.tasks.filter((t) => t.phase !== "plan").map((t) => [t.roleKey, t.status])).toEqual([
      ["backend", "succeeded"],
      ["frontend", "succeeded"],
      ["qa", "succeeded"],
    ]);

    const branch = `saqina/exec-${execution.id.slice(0, 8)}`;
    expect(git("rev-list", "--count", `main..${branch}`)).toBe("2");
    expect(git("show", `${branch}:src/saqina/add-a-wishlist/server.ts`)).toContain("dev mock");
    expect(git("show", `${branch}:src/saqina/add-a-wishlist/screen.tsx`)).toContain("dev mock");
    expect(git("rev-parse", "main")).toBe(mainBefore);

    const verdict = await db
      .select()
      .from(executionArtifacts)
      .where(
        and(
          eq(executionArtifacts.executionId, execution.id),
          eq(executionArtifacts.kind, "test_result"),
        ),
      );
    expect(verdict).toHaveLength(1);

    // Every model call is on record, and the pinned model answered for the backend agent only.
    const usage = await db
      .select()
      .from(aiUsageRecords)
      .where(eq(aiUsageRecords.status, "succeeded"));
    const used = new Map<string, number>();
    for (const u of usage) used.set(u.modelId ?? "none", (used.get(u.modelId ?? "none") ?? 0) + 1);
    expect(used.get(pinnedModel)).toBe(1);
    expect(used.get(defaultModel)).toBe(3); // plan, screen, review
    const commits = await db
      .select()
      .from(toolExecutions)
      .where(
        and(eq(toolExecutions.toolName, "commit_changes"), eq(toolExecutions.status, "succeeded")),
      );
    expect(commits).toHaveLength(2);
  });
});
