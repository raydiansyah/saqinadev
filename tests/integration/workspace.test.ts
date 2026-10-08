import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAgents, setPreferredAgent, updateAgentConfiguration } from "@/lib/agents/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { serializeContext } from "@/lib/context/serialize";
import { getProjectContext } from "@/lib/context/service";
import { db } from "@/lib/db/client";
import { activities, projects } from "@/lib/db/schema";
import { createDecision, listDecisions } from "@/lib/decisions/service";
import {
  createDocument,
  getDocument,
  saveDocument,
  setDocumentStatus,
} from "@/lib/documents/service";
import { AppError } from "@/lib/errors";
import { completeInterview, saveAnswers } from "@/lib/interviews/service";
import { createMemory, listMemories } from "@/lib/memory/service";
import { startProject } from "@/lib/projects/service";
import {
  createRequirement,
  deleteRequirement,
  listRequirements,
  updateRequirement,
} from "@/lib/requirements/service";
import { search } from "@/lib/search/service";
import { createTask, listTasks, updateTask } from "@/lib/tasks/service";
import { createUser, resetDatabase } from "../helpers/db";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"]) => {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
};

let owner: Actor;
let stranger: Actor;
let slug: string;
let access: ProjectAccess;

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  stranger = await createUser("Stranger");
  ({ slug } = await startProject(
    owner,
    { idea: "POS for a small restaurant with table orders" },
    "en",
  ));
  await saveAnswers(owner, {
    slug,
    step: "review",
    confirm: ["projectType"],
    patch: {
      objective: "Run a small restaurant's sales and daily operations.",
      audience: ["business-owners", "employees"],
      features: ["auth", "pos", "inventory"],
      databaseNeed: "yes",
      developmentMode: "saqina",
      deployment: "saqina-vercel",
      details: {
        platforms: ["web"],
        authMethods: ["email"],
        followUps: {},
        constraints: "Launch before Ramadan.",
      },
    },
  });
  await completeInterview(owner, slug);
  access = await loadProjectAccess(owner, { slug }, "project:read");
});

afterAll(async () => {
  await resetDatabase();
});

describe("tasks", () => {
  it("creates, completes and reopens a task, and the project starts building", async () => {
    const task = await createTask(owner, slug, { title: "Print kitchen tickets" });
    expect(task).toMatchObject({ status: "todo", source: "user", completedAt: null });

    const done = await updateTask(owner, slug, { id: task.id, status: "done" });
    expect(done.completedAt).toBeInstanceOf(Date);
    const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
    expect(project.status).toBe("building");

    const reopened = await updateTask(owner, slug, { id: task.id, status: "todo" });
    expect(reopened.completedAt).toBeNull();

    const types = (await db.select({ type: activities.type }).from(activities)).map((a) => a.type);
    expect(types).toEqual(
      expect.arrayContaining(["task.created", "task.completed", "task.reopened"]),
    );
    expect((await listTasks(access)).some((t) => t.title === "Print kitchen tickets")).toBe(true);
  });

  it("refuses tasks for another user's project and milestones from another project", async () => {
    await expectCode(createTask(stranger, slug, { title: "Sneaky task" }), "NOT_FOUND");
    const [task] = await listTasks(access);
    await expectCode(updateTask(stranger, slug, { id: task.id, status: "done" }), "NOT_FOUND");
    await expectCode(
      createTask(owner, slug, { title: "Wrong milestone", milestoneId: crypto.randomUUID() }),
      "VALIDATION_ERROR",
    );
  });
});

describe("requirements", () => {
  it("creates, updates and deletes with user attribution", async () => {
    const created = await createRequirement(owner, slug, {
      group: "integrations",
      title: "QRIS payments",
      description: "Customers pay with QRIS at the counter.",
      priority: "high",
      status: "confirmed",
    });
    const updated = await updateRequirement(owner, slug, { ...created, priority: "critical" });
    expect(updated).toMatchObject({ priority: "critical", source: "user", updatedBy: owner.id });
    await deleteRequirement(owner, slug, { id: created.id });
    expect((await listRequirements(access)).some((r) => r.id === created.id)).toBe(false);
    await expectCode(deleteRequirement(stranger, slug, { id: created.id }), "NOT_FOUND");
  });
});

describe("documents", () => {
  it("saves a new version and refuses a stale edit", async () => {
    const prd = await getDocument(access, "prd");
    expect(prd?.version).toBe(1);
    const saved = await saveDocument(owner, slug, {
      docSlug: "prd",
      content: `${prd?.content}\nEdited.`,
      baseVersion: 1,
    });
    expect(saved.version).toBe(2);
    await expectCode(
      saveDocument(owner, slug, { docSlug: "prd", content: "Overwrite", baseVersion: 1 }),
      "CONFLICT",
    );
    await setDocumentStatus(owner, slug, { docSlug: "prd", status: "approved" });
    expect((await getDocument(access, "prd"))?.status).toBe("approved");
  });

  it("creates custom documents with unique, non-reserved slugs", async () => {
    const a = await createDocument(owner, slug, { title: "Kitchen workflow" });
    const b = await createDocument(owner, slug, { title: "Kitchen workflow" });
    const c = await createDocument(owner, slug, { title: "PRD" });
    expect([a.slug, b.slug, c.slug]).toEqual([
      "kitchen-workflow",
      "kitchen-workflow-2",
      "prd-notes",
    ]);
  });
});

describe("memory and decisions", () => {
  it("adds memory and numbers decisions sequentially", async () => {
    await createMemory(owner, slug, {
      title: "Receipts in Bahasa Indonesia",
      content: "Customers expect receipts in Indonesian.",
      category: "user_preference",
    });
    expect((await listMemories(access, "user_preference")).map((m) => m.title)).toContain(
      "Receipts in Bahasa Indonesia",
    );

    const before = (await listDecisions(access)).length;
    const decision = await createDecision(owner, slug, {
      question: "Which payment method comes first?",
      options: ["QRIS", "Card"],
      selected: "QRIS",
      reason: "Most customers already pay with QRIS.",
    });
    expect(decision.number).toBe(before + 1);
    await expectCode(
      createDecision(owner, slug, {
        question: "Pick one?",
        options: ["A"],
        selected: "B",
        reason: "Because.",
      }),
      "VALIDATION_ERROR",
    );
  });
});

describe("agents", () => {
  it("switches the preferred agent and rejects secrets in configuration", async () => {
    await setPreferredAgent(owner, slug, { type: "claude" });
    const list = await listAgents(access);
    expect(list.find((a) => a.type === "claude")?.status).toBe("pending");
    expect(list.filter((a) => a.status === "pending")).toHaveLength(1);

    await updateAgentConfiguration(owner, slug, {
      type: "claude",
      configuration: { model: "claude-opus-5-5" },
    });
    await expectCode(
      updateAgentConfiguration(owner, slug, {
        type: "claude",
        configuration: { apiKey: "anything" },
      }),
      "VALIDATION_ERROR",
    );
    await expectCode(
      updateAgentConfiguration(owner, slug, {
        type: "claude",
        configuration: { note: "sk-ant-abcdefghijklmnop" },
      }),
      "VALIDATION_ERROR",
    );
  });
});

describe("project context", () => {
  it("assembles project, requirements, PRD, tasks, memory and decisions from the database", async () => {
    const files = serializeContext(await getProjectContext(access));
    expect(files["PROJECT.md"]).toContain("# Restaurant POS");
    expect(files["PROJECT.md"]).toContain("## Open questions");
    expect(files["PRD.md"]).toContain("Edited.");
    expect(files["TASKS.md"]).toContain("Print kitchen tickets");
    expect(files["MEMORY.md"]).toContain("Receipts in Bahasa Indonesia");
    expect(files["MEMORY.md"]).toContain("Launch before Ramadan.");
    expect(files["DECISIONS.md"]).toContain("Which payment method comes first?");
  });
});

describe("search", () => {
  it("finds the owner's content and nothing for other users", async () => {
    const hits = await search(owner, "kitchen");
    expect(hits.map((h) => h.kind)).toEqual(expect.arrayContaining(["task", "document"]));
    expect(await search(stranger, "kitchen")).toEqual([]);
    expect(await search(owner, "100%")).toEqual([]);
  });
});
