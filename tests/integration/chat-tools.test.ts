import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockAiProvider } from "@/lib/ai/mock";
import { handleMessage } from "@/lib/assistant/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import {
  forkConversation,
  pinChapter,
  previewRewind,
  rewindConversation,
  setAgentAccess,
  unpinChapter,
} from "@/lib/conversations/chat-tools";
import { listConversations, loadMessages } from "@/lib/conversations/service";
import { db } from "@/lib/db/client";
import {
  auditEvents,
  conversationChanges,
  conversations,
  messages,
  projectMembers,
  proposals,
  tasks,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { updateTask } from "@/lib/tasks/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"]) => {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
};

const provider = new MockAiProvider();
let owner: Actor;
let viewer: Actor;
let stranger: Actor;
let slug: string;
let otherSlug: string;
let access: ProjectAccess;

async function say(actor: Actor, content: string, extra: Record<string, unknown> = {}) {
  let conversationId = "";
  await handleMessage(
    actor,
    slug,
    { clientId: randomUUID(), content, locale: "en", ...extra },
    (e) => {
      if (e.type === "started") conversationId = e.conversationId;
    },
    { provider },
  );
  return conversationId;
}

const thread = async (actor = owner, conversationId = "") => {
  const a = await loadProjectAccess(actor, { slug }, "project:read");
  return (await loadMessages(a, conversationId)).messages;
};

const taskTitled = async (title: string) =>
  (
    await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, access.project.id), eq(tasks.title, title)))
  )[0];

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  viewer = await createUser("Viewer");
  stranger = await createUser("Stranger");
  slug = await project(owner, "A shop for handmade ceramics");
  otherSlug = await project(stranger, "A booking site for a barbershop");
  access = await loadProjectAccess(owner, { slug }, "project:read");
  await db
    .insert(projectMembers)
    .values({ projectId: access.project.id, userId: viewer.id, role: "viewer" });
});

afterAll(async () => {
  await resetDatabase();
});

describe("pin as chapter", () => {
  it("names a message, lists it in order, and takes it back", async () => {
    const id = await say(owner, "What is in project memory?", { fresh: true });
    const [first, reply] = await thread(owner, id);
    const pinned = await pinChapter(owner, slug, {
      conversationId: id,
      messageId: first.id,
      title: "Kickoff",
    });
    expect(pinned.title).toBe("Kickoff");
    await pinChapter(owner, slug, { conversationId: id, messageId: reply.id });

    const page = await loadMessages(access, id);
    expect(page.chapters.map((c) => c.title)).toEqual([
      "Kickoff",
      reply.content.slice(0, 60).replace(/\s+/g, " ").trim(),
    ]);
    expect(page.messages.find((m) => m.id === first.id)?.chapterTitle).toBe("Kickoff");

    await unpinChapter(owner, slug, { conversationId: id, messageId: first.id });
    expect((await loadMessages(access, id)).chapters).toHaveLength(1);
    const audit = await db.select().from(auditEvents).where(eq(auditEvents.entityId, id));
    expect(audit.map((a) => a.type)).toEqual(
      expect.arrayContaining(["assistant.chapter_pinned", "assistant.chapter_unpinned"]),
    );
  });

  it("is private: another member or project gets NOT_FOUND", async () => {
    const id = await say(owner, "hello", { fresh: true });
    const [first] = await thread(owner, id);
    await expectCode(
      pinChapter(viewer, slug, { conversationId: id, messageId: first.id }),
      "NOT_FOUND",
    );
    await expectCode(
      pinChapter(stranger, slug, { conversationId: id, messageId: first.id }),
      "AUTHORIZATION_ERROR",
    ).catch(() => undefined);
    await expectCode(
      pinChapter(stranger, otherSlug, { conversationId: id, messageId: first.id }),
      "NOT_FOUND",
    );
  });
});

describe("fork from here", () => {
  it("copies the thread up to the message and leaves the original alone", async () => {
    const id = await say(owner, "Is our PRD consistent?", { fresh: true });
    await say(owner, "What is in project memory?", { conversationId: id });
    const original = await thread(owner, id);
    expect(original).toHaveLength(4);
    const { conversationId: forkId, copied } = await forkConversation(owner, slug, {
      conversationId: id,
      messageId: original[1].id,
      title: "Fork: PRD",
    });
    expect(copied).toBe(2);
    const forked = await thread(owner, forkId);
    expect(forked.map((m) => m.content)).toEqual(original.slice(0, 2).map((m) => m.content));
    expect(forked.every((m) => !original.some((o) => o.id === m.id))).toBe(true);
    expect(await thread(owner, id)).toHaveLength(4);

    const [row] = await db.select().from(conversations).where(eq(conversations.id, forkId));
    expect(row).toMatchObject({
      parentConversationId: id,
      forkedFromMessageId: original[1].id,
      title: "Fork: PRD",
    });
    const page = await loadMessages(access, forkId);
    expect(page.conversation.parent).toMatchObject({ id });
    expect(
      (await listConversations(access)).find((c) => c.id === forkId)?.parentConversationId,
    ).toBe(id);

    // The fork is a thread of its own: the assistant continues it.
    await say(owner, "What is in project memory?", { conversationId: forkId });
    expect(await thread(owner, forkId)).toHaveLength(4);
    expect(await thread(owner, id)).toHaveLength(4);
  });

  it("copies nothing a person cannot see: proposal cards stay with the original", async () => {
    const id = await say(owner, "Hapus semua task yang belum dimulai.", { fresh: true });
    const original = await thread(owner, id);
    expect(original[1].blocks.some((b) => b.type === "proposal")).toBe(true);
    const { conversationId } = await forkConversation(owner, slug, {
      conversationId: id,
      messageId: original[1].id,
    });
    const forked = await thread(owner, conversationId);
    expect(forked[1].blocks.some((b) => b.type === "proposal")).toBe(false);
  });

  it("is private to the owner of the thread", async () => {
    const id = await say(owner, "hello", { fresh: true });
    const [first] = await thread(owner, id);
    await expectCode(
      forkConversation(viewer, slug, { conversationId: id, messageId: first.id }),
      "NOT_FOUND",
    );
    await expectCode(
      forkConversation(stranger, otherSlug, { conversationId: id, messageId: first.id }),
      "NOT_FOUND",
    );
  });
});

describe("rewind", () => {
  it("hides what came after and puts back what the assistant changed", async () => {
    const id = await say(owner, "What is in project memory?", { fresh: true });
    await say(owner, "Buatkan task untuk rewind-demo.", { conversationId: id });
    expect(await taskTitled("Rewind-demo")).toBeDefined();
    const before = await thread(owner, id);
    expect(before).toHaveLength(4);

    // The preview changes nothing.
    const plan = await previewRewind(owner, slug, { conversationId: id, messageId: before[1].id });
    expect(plan).toMatchObject({ removedMessages: 2, blockers: [] });
    expect(plan.undo).toEqual([{ op: "task.created", kind: "task", label: "Rewind-demo" }]);
    expect(await taskTitled("Rewind-demo")).toBeDefined();
    expect(await thread(owner, id)).toHaveLength(4);

    const result = await rewindConversation(owner, slug, {
      conversationId: id,
      messageId: before[1].id,
    });
    expect(result.applied).toBe(true);
    expect(await taskTitled("Rewind-demo")).toBeUndefined();
    expect((await thread(owner, id)).map((m) => m.id)).toEqual(before.slice(0, 2).map((m) => m.id));
    // Hidden, not deleted: the rows stay for the audit trail.
    const hidden = await db.select().from(messages).where(eq(messages.conversationId, id));
    expect(hidden).toHaveLength(4);
    const ledger = await db
      .select()
      .from(conversationChanges)
      .where(eq(conversationChanges.conversationId, id));
    expect(ledger.every((l) => l.undoneAt && l.undoneBy === owner.id)).toBe(true);
    const audit = await db.select().from(auditEvents).where(eq(auditEvents.entityId, id));
    expect(audit.map((a) => a.type)).toContain("assistant.conversation_rewound");

    // The thread carries on from the chosen message, and the same request works again.
    await say(owner, "Buatkan task untuk rewind-demo.", { conversationId: id });
    expect(await taskTitled("Rewind-demo")).toBeDefined();
    expect(await thread(owner, id)).toHaveLength(4);
  });

  it("refuses, and changes nothing, when someone edited a record since", async () => {
    const id = await say(owner, "What is in project memory?", { fresh: true });
    await say(owner, "Buatkan task untuk edited-since.", { conversationId: id });
    const task = await taskTitled("Edited-since");
    await updateTask(owner, slug, { id: task.id, status: "done" });
    const [, reply] = await thread(owner, id);

    const result = await rewindConversation(owner, slug, {
      conversationId: id,
      messageId: reply.id,
    });
    expect(result.applied).toBe(false);
    expect(result.plan.blockers).toEqual([
      { kind: "task", label: "Edited-since", reason: "changed" },
    ]);
    expect((await taskTitled("Edited-since")).status).toBe("done");
    expect(await thread(owner, id)).toHaveLength(4);
  });

  it("refuses to cross a change that cannot be taken back", async () => {
    const id = await say(owner, "What is in project memory?", { fresh: true });
    const second = await say(owner, "Is our PRD consistent?", { conversationId: id });
    const [first, , , secondReply] = await thread(owner, second);
    await db.insert(conversationChanges).values({
      projectId: access.project.id,
      conversationId: id,
      messageId: secondReply.id,
      steps: [{ op: "irreversible", action: "CREATE_INVOICE", label: "Deposit" }],
    });
    const plan = await previewRewind(owner, slug, { conversationId: id, messageId: first.id });
    expect(plan.blockers).toEqual([
      { kind: "CREATE_INVOICE", label: "Deposit", reason: "irreversible" },
    ]);
    const result = await rewindConversation(owner, slug, {
      conversationId: id,
      messageId: first.id,
    });
    expect(result.applied).toBe(false);
    expect(await thread(owner, id)).toHaveLength(4);
  });

  it("cancels proposals still waiting and keeps the project as it was", async () => {
    const id = await say(owner, "What is in project memory?", { fresh: true });
    await say(owner, "Hapus semua task yang belum dimulai.", { conversationId: id });
    const [, reply] = await thread(owner, id);
    const pending = await db
      .select()
      .from(proposals)
      .where(and(eq(proposals.conversationId, id), eq(proposals.status, "pending")));
    expect(pending).toHaveLength(1);
    const result = await rewindConversation(owner, slug, {
      conversationId: id,
      messageId: reply.id,
    });
    expect(result.plan.cancelledProposals).toBe(1);
    const [after] = await db.select().from(proposals).where(eq(proposals.id, pending[0].id));
    expect(after.status).toBe("cancelled");
  });

  it("needs write access, a message after the chosen one, and your own thread", async () => {
    const mine = await say(viewer, "What is in project memory?", { fresh: true });
    const [first] = await thread(viewer, mine);
    await expectCode(
      rewindConversation(viewer, slug, { conversationId: mine, messageId: first.id }),
      "AUTHORIZATION_ERROR",
    );

    const id = await say(owner, "hello", { fresh: true });
    const all = await thread(owner, id);
    await expectCode(
      rewindConversation(owner, slug, { conversationId: id, messageId: all.at(-1)?.id }),
      "VALIDATION_ERROR",
    );
    await expectCode(
      rewindConversation(owner, slug, { conversationId: mine, messageId: first.id }),
      "NOT_FOUND",
    );
    await expectCode(
      rewindConversation(stranger, otherSlug, { conversationId: id, messageId: all[0].id }),
      "NOT_FOUND",
    );
  });

  it("is hidden from what the assistant reads back", async () => {
    const id = await say(owner, "What is in project memory?", { fresh: true });
    await say(owner, "Is our PRD consistent?", { conversationId: id });
    const [, reply] = await thread(owner, id);
    await rewindConversation(owner, slug, { conversationId: id, messageId: reply.id });
    const [item] = (await listConversations(access)).filter((c) => c.id === id);
    expect(item.lastMessage).toBe(reply.content);
  });
});

describe("agent access", () => {
  it("is off by default and switched by the owner only", async () => {
    const id = await say(owner, "hello", { fresh: true });
    expect((await loadMessages(access, id)).conversation.agentAccess).toBe(false);
    await expectCode(
      setAgentAccess(viewer, slug, { conversationId: id, enabled: true }),
      "NOT_FOUND",
    );
    await setAgentAccess(owner, slug, { conversationId: id, enabled: true });
    expect((await loadMessages(access, id)).conversation.agentAccess).toBe(true);
  });
});
