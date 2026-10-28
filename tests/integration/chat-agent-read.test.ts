import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureTeamAgents } from "@/lib/agents/registry";
import { MockAiProvider } from "@/lib/ai/mock";
import { handleMessage } from "@/lib/assistant/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { rewindConversation, setAgentAccess } from "@/lib/conversations/chat-tools";
import { listAgentReads, loadMessages } from "@/lib/conversations/service";
import { db } from "@/lib/db/client";
import { agents, projects } from "@/lib/db/schema";
import { handleMcpRequest } from "@/lib/mcp/server";
import { createAgentToken } from "@/lib/mcp/tokens";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const provider = new MockAiProvider();
let owner: Actor;
let slug: string;
let projectId: string;
let agentId: string;
let token: string;
let rpcId = 0;

const tool = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await handleMcpRequest(
    new Request(`https://saqina.dev/api/projects/${slug}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++rpcId,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
    slug,
  );
  return (await res.json()) as {
    result?: { isError?: boolean; structuredContent?: Record<string, unknown> };
  };
};

async function say(content: string, conversationId?: string) {
  let id = "";
  await handleMessage(
    owner,
    slug,
    { clientId: randomUUID(), content, locale: "en", conversationId, fresh: !conversationId },
    (e) => {
      if (e.type === "started") id = e.conversationId;
    },
    { provider },
  );
  return id;
}

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  slug = await project(owner, "A shop for handmade ceramics");
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
  projectId = p.id;
  await ensureTeamAgents(db, projectId);
  const [agent] = await db
    .insert(agents)
    .values({
      projectId,
      name: "Claude Code",
      type: "claude",
      provider: "anthropic",
      permissions: ["read_project"],
    })
    .returning();
  agentId = agent.id;
  token = (
    await createAgentToken(owner, slug, { label: "Claude Code", agentId, scopes: ["read_project"] })
  ).token;
});

describe("read_conversation", () => {
  it("never shows a private thread, and records the read once it is shared", async () => {
    const id = await say("What is in project memory?");
    const access = await loadProjectAccess(owner, { slug }, "project:read");

    // Private by default: not listed, not readable, and the answer is the same as for no thread.
    expect((await tool("list_conversations")).result?.structuredContent?.conversations).toEqual([]);
    const hidden = await tool("read_conversation", { conversationId: id });
    expect(hidden.result?.isError).toBe(true);
    expect(await listAgentReads(id)).toEqual([]);

    await setAgentAccess(owner, slug, { conversationId: id, enabled: true });
    const listed = (await tool("list_conversations")).result?.structuredContent?.conversations as {
      id: string;
    }[];
    expect(listed.map((c) => c.id)).toEqual([id]);

    const read = (await tool("read_conversation", { conversationId: id })).result
      ?.structuredContent;
    expect((read?.messages as unknown[]).length).toBe(2);
    const [seen] = await listAgentReads(id);
    expect(seen).toMatchObject({ agentId, name: "Claude Code" });

    // A message written after the read has not been read yet.
    const page1 = await loadMessages(access, id);
    expect(page1.agentReads).toHaveLength(1);
    await say("Is our PRD consistent?", id);
    const page2 = await loadMessages(access, id);
    const readAt = page2.agentReads[0].lastMessageAt.getTime();
    const unread = page2.messages.filter((m) => m.createdAt.getTime() > readAt);
    expect(unread).toHaveLength(2);

    // Reading again moves the mark forward, never back.
    await tool("read_conversation", { conversationId: id, limit: 1 });
    const [after] = await listAgentReads(id);
    expect(after.lastMessageAt.getTime()).toBeGreaterThanOrEqual(readAt);
  });

  it("does not show messages that were rewound, or a thread that is shared then closed", async () => {
    const id = await say("What is in project memory?");
    await say("Is our PRD consistent?", id);
    await setAgentAccess(owner, slug, { conversationId: id, enabled: true });
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const [first] = (await loadMessages(access, id)).messages;
    await rewindConversation(owner, slug, { conversationId: id, messageId: first.id });
    const read = (await tool("read_conversation", { conversationId: id })).result
      ?.structuredContent;
    expect((read?.messages as { content: string }[]).map((m) => m.content)).toEqual([
      "What is in project memory?",
    ]);

    await setAgentAccess(owner, slug, { conversationId: id, enabled: false });
    expect((await tool("read_conversation", { conversationId: id })).result?.isError).toBe(true);
  });
});
