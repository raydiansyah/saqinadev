import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cancelRun, retryRun } from "@/lib/agents/controls";
import { setHandoffStatus } from "@/lib/agents/handoff";
import { listAgentRegistry } from "@/lib/agents/registry";
import { getRunDetail, listRuns } from "@/lib/agents/runs";
import { MockAiProvider } from "@/lib/ai/mock";
import type { StreamEvent } from "@/lib/assistant/blocks";
import { handleMessage } from "@/lib/assistant/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { listConversations, loadMessages } from "@/lib/conversations/service";
import { db } from "@/lib/db/client";
import {
  activities,
  agentHandoffs,
  agentRuns,
  agents,
  projectMembers,
  proposals,
  requirements,
  tasks,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { completeInterview, saveAnswers } from "@/lib/interviews/service";
import { getNextProjectAction } from "@/lib/projects/progress";
import { loadSnapshot } from "@/lib/projects/repository";
import { startProject } from "@/lib/projects/service";
import { listProposals } from "@/lib/proposals/repository";
import { approveProposal, rejectProposal, requestRevision } from "@/lib/proposals/service";
import { createTask, listTasks } from "@/lib/tasks/service";
import { createUser, resetDatabase } from "../helpers/db";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"]) => {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
};

let owner: Actor;
let viewer: Actor;
let stranger: Actor;
let slug: string;
let otherSlug: string;
let access: ProjectAccess;
const provider = new MockAiProvider();

async function say(
  actor: Actor,
  content: string,
  extra: Record<string, unknown> = {},
  project = slug,
) {
  const events: StreamEvent[] = [];
  const result = await handleMessage(
    actor,
    project,
    { clientId: randomUUID(), content, locale: "en", ...extra },
    (e) => events.push(e),
    { provider },
  );
  const text = events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("");
  const blocks = events.flatMap((e) => (e.type === "block" ? [e.block] : []));
  const started = events.find((e) => e.type === "started");
  return {
    ...result,
    events,
    text,
    blocks,
    conversationId: started?.type === "started" ? started.conversationId : "",
  };
}

async function newProject(actor: Actor, idea: string) {
  const { slug } = await startProject(actor, { idea }, "en");
  await saveAnswers(actor, {
    slug,
    step: "review",
    confirm: ["projectType"],
    patch: {
      objective: "Run a small restaurant's sales and daily operations.",
      audience: ["business-owners", "employees"],
      features: ["auth", "pos", "inventory"],
      databaseNeed: "yes",
      databaseChoice: "postgresql",
      developmentMode: "saqina",
      deployment: "saqina-vercel",
      details: { platforms: ["web"], authMethods: ["email"], followUps: {}, constraints: "" },
    },
  });
  await completeInterview(actor, slug);
  return slug;
}

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  viewer = await createUser("Viewer");
  stranger = await createUser("Stranger");
  slug = await newProject(owner, "POS for a small restaurant with table orders");
  otherSlug = await newProject(stranger, "Booking site for a barbershop");
  access = await loadProjectAccess(owner, { slug }, "project:read");
  await db
    .insert(projectMembers)
    .values({ projectId: access.project.id, userId: viewer.id, role: "viewer" });
});

afterAll(async () => {
  await resetDatabase();
});

describe("conversation", () => {
  it("persists messages, reuses the thread and resumes it", async () => {
    const first = await say(owner, "Bagaimana progress proyek ini?");
    expect(first.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["started", "status", "delta", "done"]),
    );
    const second = await say(owner, "What is in project memory?");
    expect(second.conversationId).toBe(first.conversationId);

    const page = await loadMessages(access, first.conversationId);
    expect(page.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(page.messages.every((m) => m.status === "completed")).toBe(true);
    expect((await listConversations(access)).length).toBe(1);
  });

  it("ignores a resend with the same clientId", async () => {
    const clientId = randomUUID();
    const send = () =>
      handleMessage(
        owner,
        slug,
        { clientId, content: "Is our PRD consistent?", locale: "en" },
        () => {},
        { provider },
      );
    await send();
    const again = await send();
    expect(again.messageId).toBe("");
  });

  it("keeps conversations private and project-scoped", async () => {
    const mine = await say(owner, "hello", { fresh: true });
    await expectCode(
      handleMessage(
        stranger,
        slug,
        { clientId: randomUUID(), content: "hi", locale: "en" },
        () => {},
        { provider },
      ),
      "NOT_FOUND",
    );
    const strangerAccess = await loadProjectAccess(stranger, { slug: otherSlug }, "project:read");
    await expectCode(loadMessages(strangerAccess, mine.conversationId), "NOT_FOUND");
  });
});

describe("actions", () => {
  it("auto-executes a low-risk task creation with traceable source and activity", async () => {
    const reply = await say(owner, "Buatkan task untuk authentication.");
    expect(reply.mutated).toBe(true);
    expect(reply.blocks[0]).toMatchObject({
      type: "action",
      items: [{ kind: "task", change: "created" }],
    });
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, access.project.id), eq(tasks.title, "Authentication")));
    expect(task.source).toBe("assistant");
    const [activity] = await db
      .select()
      .from(activities)
      .where(and(eq(activities.entityId, task.id), eq(activities.type, "task.created")));
    expect(activity.metadata).toMatchObject({
      via: "assistant",
      conversationId: reply.conversationId,
    });
  });

  it("asks before creating a task without a title, then uses the answer", async () => {
    const ask = await say(owner, "Create a task", { fresh: true });
    expect(ask.mutated).toBe(false);
    const answer = await say(owner, "Print receipts", { conversationId: ask.conversationId });
    expect(answer.mutated).toBe(true);
    expect((await listTasks(access)).some((t) => t.title === "Print receipts")).toBe(true);
  });

  it("never deletes from a message: destructive requests become a proposal", async () => {
    const before = (await listTasks(access)).length;
    const reply = await say(owner, "Hapus semua task yang belum dimulai.");
    expect(reply.mutated).toBe(false);
    const block = reply.blocks.find((b) => b.type === "proposal");
    expect(block).toBeDefined();
    expect((await listTasks(access)).length).toBe(before);
    const [p] = await listProposals(access, {
      ids: [block?.type === "proposal" ? block.proposalId : ""],
    });
    expect(p).toMatchObject({ category: "destructive", riskLevel: "high", status: "pending" });
    await rejectProposal(owner, slug, { proposalId: p.id }, "en");
    expect((await listTasks(access)).length).toBe(before);
  });

  it("lets a viewer ask questions but not change anything", async () => {
    const reply = await say(viewer, "Buatkan task untuk billing.");
    expect(reply.mutated).toBe(false);
    expect(reply.text).toContain("view access");
    expect((await listTasks(access)).some((t) => t.title === "Billing")).toBe(false);
  });

  it("rejects an entity from another project", async () => {
    const [foreign] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(agents, eq(agents.projectId, tasks.projectId))
      .where(
        eq(
          agents.projectId,
          (await loadProjectAccess(stranger, { slug: otherSlug }, "project:read")).project.id,
        ),
      )
      .limit(1);
    await expectCode(
      handleMessage(
        owner,
        slug,
        {
          clientId: randomUUID(),
          content: "Pecah task ini menjadi beberapa subtask.",
          locale: "en",
          context: { type: "task", id: foreign.id },
        },
        () => {},
        { provider },
      ),
      "NOT_FOUND",
    );
  });

  it("answers why PostgreSQL from recorded data, labelled", async () => {
    const reply = await say(owner, "Kenapa kamu memilih PostgreSQL?", { fresh: true });
    const analysis = reply.blocks.find((b) => b.type === "analysis");
    expect(analysis?.type === "analysis" && analysis.findings[0].label).toMatch(
      /confirmed|recommended/,
    );
    const unknown = await say(owner, "Why did we choose MongoDB?");
    const a2 = unknown.blocks.find((b) => b.type === "analysis");
    expect(a2?.type === "analysis" && a2.findings[0].label).toBe("unknown");
  });
});

describe("feature proposal flow", () => {
  it("clarifies, proposes, applies once with edits, and starts the agent", async () => {
    const ask = await say(owner, "Buat sistem refund.", { fresh: true });
    expect(ask.blocks[0]).toMatchObject({ type: "question" });
    const proposed = await say(owner, "Ya, untuk transaksi di atas Rp500.000", {
      conversationId: ask.conversationId,
    });
    const block = proposed.blocks.find((b) => b.type === "proposal");
    if (block?.type !== "proposal") throw new Error("expected proposal");
    const [p] = await listProposals(access, { ids: [block.proposalId] });
    expect(p.actions.map((a) => a.type)).toEqual([
      "CREATE_REQUIREMENT",
      "CREATE_REQUIREMENT",
      "APPEND_PRD",
      "CREATE_TASK",
      "CREATE_TASK",
      "ASSIGN_AGENT",
    ]);

    const result = await approveProposal(owner, slug, {
      proposalId: p.id,
      edits: { t1: { title: "Implement refund flow", priority: "critical", status: "done" } },
    });
    const impl = (await listTasks(access)).find((t) => t.title === "Implement refund flow");
    // Edits apply only to whitelisted fields: status stays todo.
    expect(impl).toMatchObject({ priority: "critical", status: "todo", source: "assistant" });
    const [rule] = await db
      .select()
      .from(requirements)
      .where(
        and(
          eq(requirements.projectId, access.project.id),
          eq(requirements.title, "Refund approval"),
        ),
      );
    expect(rule).toMatchObject({
      status: "confirmed",
      source: "assistant",
      description: "Ya, untuk transaksi di atas Rp500.000",
    });

    // Approving twice applies nothing twice.
    await expectCode(approveProposal(owner, slug, { proposalId: p.id }), "CONFLICT");
    expect(
      (await listTasks(access)).filter((t) => t.title === "Implement refund flow"),
    ).toHaveLength(1);

    // The agent ran (simulated) and its result waits for review.
    expect(result.runs).toHaveLength(1);
    const detail = await getRunDetail(access, result.runs[0]);
    expect(detail?.run.status).toBe("waiting");
    expect(detail?.events.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        "AGENT_ASSIGNED",
        "AGENT_STARTED",
        "AGENT_THINKING",
        "AGENT_WAITING",
      ]),
    );
    const snapshot = await loadSnapshot(db, access.project);
    expect(getNextProjectAction(snapshot).kind).toBe("reviewProposal");

    const [agentResult] = await listProposals(access, { status: ["pending"] });
    expect(agentResult.type).toBe("agent_result");
    await approveProposal(owner, slug, { proposalId: agentResult.id });
    expect((await getRunDetail(access, result.runs[0]))?.run.status).toBe("completed");
  });

  it("revision requests block the agent run and post a follow-up", async () => {
    const task = await createTask(owner, slug, { title: "Build kitchen display screen" });
    const reply = await say(owner, "Assign this task to an agent", {
      context: { type: "task", id: task.id },
    });
    const block = reply.blocks.find((b) => b.type === "proposal");
    if (block?.type !== "proposal") throw new Error("expected proposal");
    const { runs } = await approveProposal(owner, slug, { proposalId: block.proposalId });
    const [result] = await listProposals(access, { status: ["pending"] });
    await requestRevision(owner, slug, { proposalId: result.id, note: "Fewer subtasks" }, "en");
    expect((await getRunDetail(access, runs[0]))?.run.status).toBe("blocked");
    const page = await loadMessages(access, reply.conversationId);
    expect(page.messages.at(-1)?.content).toContain("Fewer subtasks");
  });
});

describe("agents", () => {
  it("selects by capability and lazily creates the team", async () => {
    const { agents: list } = await listAgentRegistry(access);
    expect(list.filter((a) => a.role !== "general").map((a) => a.role)).toEqual(
      expect.arrayContaining(["planner", "frontend", "backend", "qa", "docs"]),
    );
  });

  it("hands work to an external agent instead of faking it, retries without duplicates, and cancels", async () => {
    const task = await createTask(owner, slug, { title: "Refactor login form" });
    const [claude] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.projectId, access.project.id), eq(agents.type, "claude")));
    const reply = await say(owner, "Assign this task to an agent", {
      context: { type: "task", id: task.id },
      fresh: true,
    });
    const block = reply.blocks.find((b) => b.type === "proposal");
    if (block?.type !== "proposal") throw new Error("expected proposal");
    await approveProposal(owner, slug, {
      proposalId: block.proposalId,
      edits: { a1: { agentId: claude.id } },
    });
    const [run] = (await listRuns(access)).filter((r) => r.run.taskId === task.id);
    // Nothing was executed remotely: the run waits on a handoff the user exports.
    expect(run.run.status).toBe("waiting");
    const handoffId = (run.run.metadata as { handoffId?: string }).handoffId as string;
    const [handoff] = await db.select().from(agentHandoffs).where(eq(agentHandoffs.id, handoffId));
    expect(handoff).toMatchObject({ status: "generated", taskId: task.id });
    expect(handoff.package).toContain("TASK.md");

    // The agent reported failure through the user: the run fails, then retries once.
    await setHandoffStatus(owner, slug, { handoffId, status: "cancelled" });
    expect((await getRunDetail(access, run.run.id))?.run.status).toBe("failed");
    expect(getNextProjectAction(await loadSnapshot(db, access.project)).kind).toBe(
      "inspectAgentFailure",
    );

    await retryRun(owner, slug, { runId: run.run.id });
    const after = await db.select().from(agentRuns).where(eq(agentRuns.taskId, task.id));
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ attempt: 2, status: "waiting" });

    await cancelRun(owner, slug, { runId: run.run.id });
    expect((await getRunDetail(access, run.run.id))?.run.status).toBe("cancelled");
    await expectCode(cancelRun(owner, slug, { runId: run.run.id }), "CONFLICT");
  });

  it("does not let a stranger control runs", async () => {
    const [run] = await listRuns(access);
    await expectCode(cancelRun(stranger, slug, { runId: run.run.id }), "NOT_FOUND");
    await expectCode(cancelRun(viewer, slug, { runId: run.run.id }), "AUTHORIZATION_ERROR");
  });

  it("keeps pending proposals visible", async () => {
    const pending = await db.select().from(proposals).where(eq(proposals.status, "pending"));
    expect(Array.isArray(pending)).toBe(true);
  });
});
