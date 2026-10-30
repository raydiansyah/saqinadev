import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { createUser, resetDatabase } from "../helpers/db";

const session = vi.hoisted(() => ({ actor: null as Actor | null }));
vi.mock("@/lib/auth/server", () => ({ getActor: async () => session.actor }));

import { GET as eventsRoute } from "@/app/api/projects/[slug]/executions/[id]/events/route";
import { GET as snapshotRoute } from "@/app/api/projects/[slug]/executions/[id]/route";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { loadMessages } from "@/lib/conversations/service";
import { db } from "@/lib/db/client";
import { executions, messages, projectMembers, projects } from "@/lib/db/schema";
import { startExecution } from "@/lib/executions/service";
import { getExecutionSnapshot } from "@/lib/executions/view";
import { drainExecutions } from "@/lib/executions/worker";
import { fakePlanner, PLAN, scripted } from "../helpers/engine";
import { project } from "../helpers/project";

let owner: Actor;
let slug: string;
beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  slug = await project(owner, "An online shop selling handmade candles to local customers");
  session.actor = owner;
});

const ctx = (s: string, id: string) => ({ params: Promise.resolve({ slug: s, id }) }) as never;
const snapshot = (s: string, id: string) =>
  snapshotRoute(new Request(`http://localhost/api/projects/${s}/executions/${id}`), ctx(s, id));
const stream = (
  s: string,
  id: string,
  init: { after?: number; lastEventId?: number; signal?: AbortSignal } = {},
) =>
  eventsRoute(
    new Request(
      `http://localhost/api/projects/${s}/executions/${id}/events${init.after !== undefined ? `?after=${init.after}` : ""}`,
      {
        headers:
          init.lastEventId !== undefined ? { "last-event-id": String(init.lastEventId) } : {},
        signal: init.signal,
      },
    ),
    ctx(s, id),
  );

const finished = async () => {
  const { provider } = fakePlanner(PLAN);
  const { executor } = scripted();
  const execution = await startExecution(owner, slug, {
    mode: "build",
    request: "Build the checkout",
  });
  await drainExecutions({ provider, taskExecutor: executor });
  return execution.id;
};

/** The events in a stream body: their numbers in order, and whether it ended with `end`. */
const parse = (body: string) => ({
  ids: [...body.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1])),
  ended: /^event: end$/m.test(body),
  retry: /^retry: \d+$/m.test(body),
});

describe("execution snapshot route", () => {
  it("shows the execution to a member of the project", async () => {
    const id = await finished();
    const res = await snapshot(slug, id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.execution).toMatchObject({ id, status: "succeeded", mode: "build" });
    expect(body.data.execution.tasks).toHaveLength(4);
    expect(body.data.events.length).toBeGreaterThan(5);
    // The copy says which event it includes, so the browser can tell a stale copy from a new one.
    expect(body.data.execution.seq).toBe(body.data.events.at(-1).seq);
    expect(body.data.execution.progress).toEqual({ done: 3, total: 3 });
  });

  it("refuses a signed-out caller, a stranger and an id from another project, the same way", async () => {
    const id = await finished();
    const stranger = await createUser("Stranger");
    const otherSlug = await project(stranger, "A blog about travel photography with weekly posts");

    session.actor = null;
    expect((await snapshot(slug, id)).status).toBe(401);
    session.actor = stranger;
    expect((await snapshot(slug, id)).status).toBe(404);
    expect((await snapshot(otherSlug, id)).status).toBe(404);
    expect((await snapshot(slug, "not-an-id")).status).toBe(404);
    const unknown = await snapshot(otherSlug, "00000000-0000-4000-8000-000000000000");
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("lets a viewer read it", async () => {
    const id = await finished();
    const viewer = await createUser("Viewer");
    const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
    await db.insert(projectMembers).values({ projectId: p.id, userId: viewer.id, role: "viewer" });
    session.actor = viewer;
    expect((await snapshot(slug, id)).status).toBe(200);
  });
});

describe("execution event stream", () => {
  it("sends every event in order and says when the execution is over", async () => {
    const id = await finished();
    const res = await stream(slug, id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const { ids, ended, retry } = parse(await res.text());
    expect(ended).toBe(true);
    expect(retry).toBe(true);
    expect(ids.length).toBeGreaterThan(5);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(1);
  });

  it("resumes from the last event it was sent, with nothing missed and nothing repeated", async () => {
    const id = await finished();
    const all = parse(await (await stream(slug, id)).text()).ids;
    const middle = all[Math.floor(all.length / 2)];

    const byHeader = parse(await (await stream(slug, id, { lastEventId: middle })).text());
    expect(byHeader.ids).toEqual(all.filter((n) => n > middle));
    const byQuery = parse(await (await stream(slug, id, { after: middle })).text());
    expect(byQuery.ids).toEqual(byHeader.ids);
    // Reconnecting after the last event brings only the end of the stream.
    const tail = parse(await (await stream(slug, id, { lastEventId: all.at(-1) })).text());
    expect(tail.ids).toEqual([]);
    expect(tail.ended).toBe(true);
  });

  it("refuses a stranger and a signed-out caller", async () => {
    const id = await finished();
    const stranger = await createUser("Stranger");
    session.actor = stranger;
    expect((await stream(slug, id)).status).toBe(404);
    session.actor = null;
    expect((await stream(slug, id)).status).toBe(401);
  });

  it("does not leak the events of another project through your own slug", async () => {
    const id = await finished();
    const stranger = await createUser("Stranger");
    const otherSlug = await project(stranger, "A blog about travel photography with weekly posts");
    session.actor = stranger;
    expect((await stream(otherSlug, id)).status).toBe(404);
  });

  it("keeps an open execution's stream going and stops cleanly when the client leaves", async () => {
    const execution = await startExecution(owner, slug, { mode: "build", request: "Build" });
    const controller = new AbortController();
    const res = await stream(slug, execution.id, { signal: controller.signal });
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let text = "";
    const deadline = Date.now() + 5000;
    while (!text.includes("execution.created") && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    expect(text).toContain("retry: ");
    expect(text).toContain("event: execution");
    expect(text).toContain('"type":"execution.created"');
    expect(parse(text).ended).toBe(false);
    controller.abort();
    const closing = await Promise.race([
      (async () => {
        for (;;) if ((await reader.read()).done) return "closed";
      })(),
      new Promise((r) => setTimeout(() => r("open"), 4000)),
    ]);
    expect(closing).toBe("closed");
  });
});

describe("what a started execution leaves in the conversation", () => {
  it("records the instruction and a card for the execution, and ties them to it", async () => {
    const { provider } = fakePlanner(PLAN);
    const { executor } = scripted();
    const execution = await startExecution(owner, slug, {
      mode: "plan",
      request: "Add a checkout",
    });
    await drainExecutions({ provider, taskExecutor: executor });
    const [row] = await db.select().from(executions).where(eq(executions.id, execution.id));
    expect(row.conversationId).toBeTruthy();
    expect(row.messageId).toBeTruthy();

    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const page = await loadMessages(access, row.conversationId as string);
    const roles = page.messages.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant"]);
    expect(page.messages[0].content).toBe("Add a checkout");
    const blocks = (page.messages[1] as { blocks: Array<{ type: string; executionId?: string }> })
      .blocks;
    expect(blocks).toEqual([{ type: "execution", executionId: execution.id }]);
    expect(page.messages[1].status).toBe("completed");
  });

  it("continues the same conversation, so earlier messages are not lost", async () => {
    const first = await startExecution(owner, slug, { mode: "plan", request: "Add a checkout" });
    const second = await startExecution(owner, slug, { mode: "plan", request: "Add order emails" });
    const [a] = await db.select().from(executions).where(eq(executions.id, first.id));
    const [b] = await db.select().from(executions).where(eq(executions.id, second.id));
    expect(b.conversationId).toBe(a.conversationId);
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, a.conversationId as string));
    expect(rows).toHaveLength(4);
  });

  it("builds the same snapshot the route sends, from the stored state", async () => {
    const id = await finished();
    const direct = await getExecutionSnapshot(owner, slug, id);
    const viaRoute = (await (await snapshot(slug, id)).json()).data;
    expect(viaRoute.execution.seq).toBe(direct.execution.seq);
    expect(viaRoute.execution.tasks.map((t: { id: string }) => t.id)).toEqual(
      direct.execution.tasks.map((t) => t.id),
    );
  });
});
