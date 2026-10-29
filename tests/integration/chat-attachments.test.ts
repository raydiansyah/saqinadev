import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AiProvider, AiRequest } from "@/lib/ai/provider";
import type { StreamEvent } from "@/lib/assistant/blocks";
import { chatContextOptions } from "@/lib/assistant/chat-context";
import { handleMessage } from "@/lib/assistant/service";
import { readAttachment, uploadAttachment } from "@/lib/attachments/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { addCustomConnector, connectConnector } from "@/lib/connectors/service";
import { db } from "@/lib/db/client";
import { chatAttachments, messages, projectMembers, projects, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { startDevMcpServer } from "../../scripts/dev-mcp-server";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"]) => {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const text = (s: string) => new TextEncoder().encode(s);

/** A model stand-in: streams a fixed answer, picks tools on request, never classifies intents. */
function fakeModel(toolChoice?: { tool: string; input: Record<string, unknown> }) {
  const seen: AiRequest[] = [];
  /** Requests that wrote the reply (not intent or tool picking). */
  const answers: AiRequest[] = [];
  const p = {
    deterministic: false,
    config: { provider: "mock" as const, model: "fake-vision" },
    generate: async () => "",
    stream: async function* (r: AiRequest) {
      answers.push(r);
      yield "Model answer.";
    },
    generateObject: async (r: AiRequest, _schema: unknown, name: string) => {
      seen.push(r);
      if (name === "tool_choice") return toolChoice ?? { tool: null, input: {} };
      throw new Error("rules classify");
    },
  };
  return { provider: p as unknown as AiProvider, seen, answers };
}

let owner: Actor;
let viewer: Actor;
let stranger: Actor;
let slug: string;
let mcp: Server;

const send = async (
  actor: Actor,
  content: string,
  extra: Record<string, unknown> = {},
  provider?: AiProvider,
) => {
  const events: StreamEvent[] = [];
  const result = await handleMessage(
    actor,
    slug,
    { clientId: randomUUID(), content, locale: "en", fresh: true, ...extra },
    (e) => events.push(e),
    { provider },
  );
  return { events, result };
};

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  viewer = await createUser("Viewer");
  stranger = await createUser("Stranger");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
  slug = await project(owner, "Online shop for handmade soap");
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
  await db.insert(projectMembers).values({ projectId: p.id, userId: viewer.id, role: "viewer" });
  mcp = await startDevMcpServer(0);
});

afterAll(async () => {
  mcp?.close();
  await resetDatabase();
});

describe("chat attachments", () => {
  it("uploads by real type, and only members who can write may upload", async () => {
    const image = await uploadAttachment(owner, slug, { name: "shot.txt", bytes: PNG });
    expect(image).toMatchObject({ kind: "image", mime: "image/png", name: "shot.txt" });
    await expectCode(
      uploadAttachment(owner, slug, { name: "x.svg", bytes: text("<svg/>") }),
      "VALIDATION_ERROR",
    );
    await expectCode(
      uploadAttachment(viewer, slug, { name: "a.png", bytes: PNG }),
      "AUTHORIZATION_ERROR",
    );
    await expectCode(uploadAttachment(stranger, slug, { name: "a.png", bytes: PNG }), "NOT_FOUND");
  });

  it("an unsent upload is visible only to its uploader; a stranger never sees it", async () => {
    const file = await uploadAttachment(owner, slug, { name: "a.png", bytes: PNG });
    expect((await readAttachment(owner, slug, file.id)).bytes).toEqual(PNG);
    await expectCode(readAttachment(viewer, slug, file.id), "NOT_FOUND");
    await expectCode(readAttachment(stranger, slug, file.id), "NOT_FOUND");
  });

  it("sends a text file into the prompt and binds it to the message", async () => {
    const file = await uploadAttachment(owner, slug, {
      name: "notes.md",
      bytes: text("Customers want gift wrapping."),
    });
    const { provider, answers } = fakeModel();
    await send(owner, "What do the notes say?", { attachmentIds: [file.id] }, provider);
    const answer = answers.find((r) => r.userMessage === "What do the notes say?");
    const segment = answer?.segments.find((s) => s.label === "attached file: notes.md");
    expect(segment).toMatchObject({ kind: "external", content: "Customers want gift wrapping." });
    const [row] = await db.select().from(chatAttachments).where(eq(chatAttachments.id, file.id));
    expect(row.messageId).not.toBeNull();
    const [msg] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, row.messageId ?? ""));
    expect((msg.metadata as { attachments: { id: string }[] }).attachments[0].id).toBe(file.id);
    // Once sent, the whole project can open it.
    expect((await readAttachment(viewer, slug, file.id)).view.name).toBe("notes.md");
  });

  it("sends images to the model, and says so when no model can read them", async () => {
    const file = await uploadAttachment(owner, slug, { name: "a.png", bytes: PNG });
    const { provider, answers } = fakeModel();
    await send(owner, "What is on this screen?", { attachmentIds: [file.id] }, provider);
    const answer = answers.find((r) => r.userMessage === "What is on this screen?");
    expect(answer?.attachments).toEqual([
      {
        kind: "image",
        mime: "image/png",
        name: "a.png",
        data: Buffer.from(PNG).toString("base64"),
      },
    ]);

    const second = await uploadAttachment(owner, slug, { name: "b.png", bytes: PNG });
    const { events } = await send(owner, "What is on this screen?", { attachmentIds: [second.id] });
    const said = events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("");
    expect(said).toContain("not read");
  });

  it("refuses a file someone else uploaded, or one already sent", async () => {
    const mine = await uploadAttachment(owner, slug, { name: "a.png", bytes: PNG });
    const msg = (id: string) => ({
      clientId: randomUUID(),
      content: "look",
      locale: "en",
      fresh: true,
      attachmentIds: [id],
    });
    // Someone else cannot borrow it, even inside the same project.
    await db.insert(projectMembers).values({
      projectId: (await db.select().from(projects).where(eq(projects.slug, slug)))[0].id,
      userId: stranger.id,
      role: "editor",
    });
    await expectCode(
      handleMessage(stranger, slug, msg(mine.id), () => {}),
      "VALIDATION_ERROR",
    );
    await db.delete(projectMembers).where(eq(projectMembers.userId, stranger.id));
    await send(owner, "first", { attachmentIds: [mine.id] });
    await expectCode(
      handleMessage(owner, slug, msg(mine.id), () => {}),
      "VALIDATION_ERROR",
    );
  });
});

describe("skills and connectors in the chat", () => {
  let connectorId: string;
  beforeAll(async () => {
    const endpoint = `http://127.0.0.1:${(mcp.address() as AddressInfo).port}/mcp`;
    ({ id: connectorId } = await addCustomConnector(owner, { name: "Dev tools", endpoint }));
    await connectConnector(owner, { id: connectorId });
  });

  it("offers switched-on skills and usable connectors, and where to manage them", async () => {
    const owners = await chatContextOptions(
      await loadProjectAccess(owner, { slug }, "project:read"),
    );
    expect(owners.skills.map((s) => s.slug)).toContain("superpowers-brainstorming");
    expect(owners.connectors).toEqual([
      { id: connectorId, name: "Dev tools", tools: ["clock", "echo"] },
    ]);
    expect(owners.manage).toEqual({ platform: true, project: true });
    const viewers = await chatContextOptions(
      await loadProjectAccess(viewer, { slug }, "project:read"),
    );
    expect(viewers.manage).toEqual({ platform: false, project: false });
    expect(JSON.stringify(viewers)).not.toContain("Brainstorming\n");
  });

  it("a picked skill always reaches the prompt", async () => {
    const { provider, answers } = fakeModel();
    await send(
      owner,
      "How is the project going?",
      { use: { skills: ["superpowers-writing-plans"], connectors: [] } },
      provider,
    );
    const answer = answers.find((r) => r.userMessage === "How is the project going?");
    expect(answer?.segments.map((s) => s.label)).toContain("skill:superpowers-writing-plans");
  });

  it("a picked connector runs its tool and shows the result", async () => {
    const { provider, answers } = fakeModel({
      tool: `mcp:${connectorId}:echo`,
      input: { text: "ping" },
    });
    const { events } = await send(
      owner,
      "Echo ping please",
      { use: { skills: [], connectors: [connectorId] } },
      provider,
    );
    const block = events.find((e) => e.type === "block" && e.block.type === "tool_result");
    expect(block).toMatchObject({
      block: { tool: "echo", connector: "Dev tools", status: "succeeded" },
    });
    const answer = answers.find(
      (r) =>
        r.userMessage === "Echo ping please" && r.segments.some((s) => s.kind === "tool_output"),
    );
    expect(answer).toBeTruthy();
  });

  it("without a model, naming the tool is enough", async () => {
    const { events } = await send(owner, "clock");
    expect(
      events.some(
        (e) =>
          e.type === "block" && e.block.type === "tool_result" && e.block.status === "succeeded",
      ),
    ).toBe(true);
  });

  it("a tool that changes things outside Saqina waits for approval", async () => {
    // The owner switches the risky tool on; it still needs approval per run.
    const { setConnectorTool } = await import("@/lib/connectors/service");
    await setConnectorTool(owner, { id: connectorId, tool: "write_note", enabled: true });
    const { provider } = fakeModel({
      tool: `mcp:${connectorId}:write_note`,
      input: { note: "hi" },
    });
    const { events } = await send(
      owner,
      "Write a note",
      { use: { skills: [], connectors: [connectorId] } },
      provider,
    );
    expect(events.some((e) => e.type === "block" && e.block.type === "proposal")).toBe(true);
  });
});
