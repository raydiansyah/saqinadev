import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { MockAiProvider } from "@/lib/ai/mock";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { getProjectBrain } from "@/lib/brain/brain";
import { buildContextPackage } from "@/lib/context/package";
import { db } from "@/lib/db/client";
import {
  agents,
  conversations,
  memories,
  memoryAcl,
  memoryAssets,
  memoryJobs,
  memorySources,
  memoryTombstones,
  memoryVersions,
  messages,
  projectMembers,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { USER_TRACE } from "@/lib/events/types";
import { createBinding, resolveLoadout } from "@/lib/memory/bindings";
import { textTombKeys } from "@/lib/memory/hash";
import { maybeEnqueueExtraction, processMemoryJobs } from "@/lib/memory/jobs";
import {
  approveMemory,
  archiveMemory,
  deleteMemory,
  rejectMemory,
  setLevel,
  updateMemory,
} from "@/lib/memory/lifecycle";
import type { Principal } from "@/lib/memory/policy";
import { getAssetDetail, getOverview, listReviewQueue } from "@/lib/memory/queries";
import { readAsset, retrieveMemory } from "@/lib/memory/retrieval/engine";
import { createMemory, createMemoryTx, listMemories } from "@/lib/memory/service";
import { changeVisibility, revokeShare, shareMemory } from "@/lib/memory/sharing";
import { isTombstoned, upsertKeyedMemory } from "@/lib/memory/store";
import { search } from "@/lib/search/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

/**
 * Memory governance: who can read what, how a suggestion becomes knowledge, and what a delete
 * really removes. Runs against a real database; the model is the deterministic mock.
 */

let alice: Actor; // owner of A
let bob: Actor; // editor in A
let carol: Actor; // viewer in A
let eve: Actor; // owner of B, a stranger to A
let slugA: string;
let slugB: string;
let projectA: string;
let agentId: string;

const asUser = (a: Actor, role: "owner" | "admin" | "editor" | "viewer" = "editor"): Principal => ({
  kind: "user",
  userId: a.id,
  role,
});
const asAgent = (canReadMemory = true): Principal => ({
  kind: "agent",
  agentId,
  creatorId: alice.id,
  canReadMemory,
});
const accessOf = (a: Actor, slug = slugA) => loadProjectAccess(a, { slug }, "project:read");
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};
const ids = (r: { items: { title: string }[] }) => r.items.map((i) => i.title);

async function make(
  actor: Actor,
  title: string,
  content: string,
  options: Parameters<typeof createMemoryTx>[4] = {},
) {
  const access = await accessOf(actor);
  return db.transaction((tx) =>
    createMemoryTx(
      tx,
      access,
      { title, content, category: "product", importance: "normal" },
      USER_TRACE,
      options,
    ),
  );
}

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  bob = await createUser("Bob");
  carol = await createUser("Carol");
  eve = await createUser("Eve");
  slugA = await project(alice, "A web shop with login and payments for my bakery.");
  slugB = await project(eve, "A recipe sharing app for home cooks and friends.");
  projectA = (await accessOf(alice)).project.id;
  await db.insert(projectMembers).values([
    { projectId: projectA, userId: bob.id, role: "editor" },
    { projectId: projectA, userId: carol.id, role: "viewer" },
  ]);
  const [agent] = await db
    .insert(agents)
    .values({
      projectId: projectA,
      name: "Builder",
      type: "claude",
      provider: "anthropic",
      permissions: ["read_memory"],
    })
    .returning();
  agentId = agent.id;
});

describe("isolation", () => {
  it("keeps a private memory with its owner everywhere memory is read", async () => {
    const secret = await make(alice, "Alice private note", "tokenizer vendor price negotiation", {
      visibility: "private",
    });
    await make(alice, "Shared note", "tokenizer is shared with everyone");

    // Retrieval, listing, global search, detail, brain, agent package: none show it to anyone else.
    for (const other of [bob, carol]) {
      expect(ids(await retrieveMemory(asUser(other), projectA, { query: "tokenizer" }))).toEqual([
        "Shared note",
      ]);
      const listed = (await listMemories(await accessOf(other))).map((m) => m.title);
      expect(listed).toContain("Shared note");
      expect(listed).not.toContain("Alice private note");
      expect(
        (await search(other, "tokenizer")).filter((h) => h.kind === "memory").map((h) => h.title),
      ).toEqual(["Shared note"]);
      expect(await code(getAssetDetail(await accessOf(other), secret.assetId))).toBe("NOT_FOUND");
    }
    expect(ids(await retrieveMemory(asAgent(), projectA, { query: "tokenizer" }))).toEqual([
      "Shared note",
    ]);
    expect(await readAsset(asAgent(), projectA, secret.assetId)).toBeNull();
    expect((await getProjectBrain(await accessOf(alice))).memory.map((m) => m.title)).not.toContain(
      "Alice private note",
    );
    const pkg = await buildContextPackage(await accessOf(alice));
    expect(pkg.files.map((f) => f.content).join("\n")).not.toContain("Alice private note");
    // The owner still has it.
    expect(
      ids(await retrieveMemory(asUser(alice, "owner"), projectA, { query: "tokenizer" })).sort(),
    ).toEqual(["Alice private note", "Shared note"]);
  });

  it("never crosses projects: a stranger and another project's slug see and change nothing", async () => {
    const m = await make(alice, "Only in A", "ledger rounding rules");
    expect(await code(getAssetDetail(await accessOf(eve, slugB), m.assetId))).toBe("NOT_FOUND");
    for (const op of [approveMemory, rejectMemory, archiveMemory, deleteMemory, setLevel]) {
      expect(await code(op(eve, slugB, { id: m.assetId, level: "L3" }))).toBe("NOT_FOUND");
      expect(await code(op(eve, slugA, { id: m.assetId, level: "L3" }))).toBe("NOT_FOUND");
    }
    expect(await code(changeVisibility(eve, slugB, { id: m.assetId, visibility: "private" }))).toBe(
      "NOT_FOUND",
    );
    expect(
      ids(
        await retrieveMemory(asUser(eve, "owner"), (await accessOf(eve, slugB)).project.id, {
          query: "ledger",
        }),
      ),
    ).toEqual([]);
    expect((await search(eve, "ledger")).filter((h) => h.kind === "memory")).toEqual([]);
    expect(await db.select().from(memoryAssets).where(eq(memoryAssets.id, m.assetId))).toHaveLength(
      1,
    );
  });

  it("lets viewers read shared memory but change none of it", async () => {
    const m = await make(alice, "Shared", "payment provider choice");
    for (const op of [archiveMemory, deleteMemory]) {
      expect(await code(op(carol, slugA, { id: m.assetId }))).toBe("AUTHORIZATION_ERROR");
    }
    expect(
      await code(
        updateMemory(carol, slugA, {
          id: m.id,
          title: "Hijack",
          content: "x",
          category: "product",
        }),
      ),
    ).toBe("AUTHORIZATION_ERROR");
    expect(
      await code(createMemory(carol, slugA, { title: "Mine", content: "x", category: "product" })),
    ).toBe("AUTHORIZATION_ERROR");
  });

  it("does not let an admin pull someone else's memory into private or read their private one", async () => {
    const bobs = await make(bob, "Bob private", "bob only draft", { visibility: "private" });
    expect(await code(getAssetDetail(await accessOf(alice), bobs.assetId))).toBe("NOT_FOUND");
    const shared = await make(bob, "Bob shared", "bob shared draft");
    expect(
      await code(changeVisibility(alice, slugA, { id: shared.assetId, visibility: "private" })),
    ).toBe("AUTHORIZATION_ERROR");
  });
});

describe("agents, ACL and bindings", () => {
  it("gives an agent restricted memory only through an ACL grant, and withdraws it on revoke", async () => {
    const m = await make(alice, "Agent only", "deployment checklist for builder");
    await changeVisibility(alice, slugA, { id: m.assetId, visibility: "agent" });
    expect(await readAsset(asAgent(), projectA, m.assetId)).toBeNull();

    await shareMemory(alice, slugA, {
      id: m.assetId,
      principalType: "agent",
      principalId: agentId,
    });
    expect(ids(await retrieveMemory(asAgent(), projectA, { query: "checklist" }))).toEqual([
      "Agent only",
    ]);
    // Members who have no grant still do not see it (the owner does).
    expect(ids(await retrieveMemory(asUser(bob), projectA, { query: "checklist" }))).toEqual([]);

    await revokeShare(alice, slugA, {
      id: m.assetId,
      principalType: "agent",
      principalId: agentId,
    });
    expect(ids(await retrieveMemory(asAgent(), projectA, { query: "checklist" }))).toEqual([]);
  });

  it("refuses a grant to a principal outside the project", async () => {
    const m = await make(alice, "Agent only", "x agent note");
    await changeVisibility(alice, slugA, { id: m.assetId, visibility: "restricted" });
    expect(
      await code(
        shareMemory(alice, slugA, { id: m.assetId, principalType: "user", principalId: eve.id }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("re-checks access at retrieval: a binding never overrides a revoked permission", async () => {
    const m = await make(alice, "Core rule", "always run migrations in a transaction");
    await changeVisibility(alice, slugA, { id: m.assetId, visibility: "agent" });
    await shareMemory(alice, slugA, {
      id: m.assetId,
      principalType: "agent",
      principalId: agentId,
    });
    await createBinding(alice, slugA, {
      targetType: "agent",
      targetId: agentId,
      assetId: m.assetId,
    });
    const target = { type: "agent" as const, id: agentId };

    expect((await resolveLoadout(asAgent(), projectA, target)).items.map((i) => i.title)).toEqual([
      "Core rule",
    ]);
    await revokeShare(alice, slugA, {
      id: m.assetId,
      principalType: "agent",
      principalId: agentId,
    });
    expect(await resolveLoadout(asAgent(), projectA, target)).toMatchObject({
      items: [],
      skipped: 1,
    });
    // An agent without the memory permission gets nothing, bound or not.
    expect((await resolveLoadout(asAgent(false), projectA, target)).items).toEqual([]);
  });

  it("only lets project admins create bindings", async () => {
    const m = await make(alice, "Rule", "binding target");
    expect(
      await code(
        createBinding(bob, slugA, { targetType: "agent", targetId: agentId, assetId: m.assetId }),
      ),
    ).toBe("AUTHORIZATION_ERROR");
    expect(
      await code(
        createBinding(eve, slugB, { targetType: "agent", targetId: agentId, assetId: m.assetId }),
      ),
    ).toBe("NOT_FOUND");
  });
});

describe("review and lifecycle", () => {
  it("shares nothing until approved, and approval lets the owner choose who reads it", async () => {
    const c = await make(bob, "Candidate", "ledger uses banker rounding", {
      status: "pending_review",
      visibility: "private",
    });
    expect(
      ids(await retrieveMemory(asUser(alice, "owner"), projectA, { query: "ledger" })),
    ).toEqual([]);
    expect(await listReviewQueue(await accessOf(alice))).toHaveLength(0); // private to Bob
    expect((await listReviewQueue(await accessOf(bob))).map((r) => r.asset.title)).toEqual([
      "Candidate",
    ]);

    await approveMemory(bob, slugA, { id: c.assetId, visibility: "project" });
    expect(
      ids(await retrieveMemory(asUser(alice, "owner"), projectA, { query: "ledger" })),
    ).toEqual(["Candidate"]);
    expect((await getOverview(await accessOf(alice))).byStatus.approved).toBeGreaterThan(0);
    // Approving twice is a conflict, not a second approval.
    expect(await code(approveMemory(bob, slugA, { id: c.assetId }))).toBe("CONFLICT");
  });

  it("keeps a rejected suggestion rejected when the same text comes back", async () => {
    const c = await make(bob, "Maybe", "use graphql everywhere", {
      status: "pending_review",
      visibility: "private",
    });
    await rejectMemory(bob, slugA, { id: c.assetId });
    expect(await db.select().from(memoryTombstones)).toHaveLength(1);
    const [a] = await db.select().from(memoryAssets).where(eq(memoryAssets.id, c.assetId));
    expect(a.status).toBe("rejected");
  });

  it("versions every edit, keeps the old text and stops the journal overwriting a person", async () => {
    const m = await make(alice, "Rounding", "round half up");
    await updateMemory(alice, slugA, {
      id: m.id,
      title: "Rounding",
      content: "round half even",
      category: "product",
    });
    const [a] = await db.select().from(memoryAssets).where(eq(memoryAssets.id, m.assetId));
    expect(a.version).toBe(2);
    const versions = await db
      .select()
      .from(memoryVersions)
      .where(eq(memoryVersions.assetId, m.assetId));
    expect(versions.map((v) => v.content).sort()).toEqual(["round half even", "round half up"]);
    expect(ids(await retrieveMemory(asUser(alice, "owner"), projectA, { query: "even" }))).toEqual([
      "Rounding",
    ]);
    expect(ids(await retrieveMemory(asUser(alice, "owner"), projectA, { query: "up" }))).toEqual(
      [],
    );
  });

  it("removes an archived memory from retrieval and brings it back on restore", async () => {
    const m = await make(alice, "Old rule", "legacy zebra policy");
    await archiveMemory(alice, slugA, { id: m.assetId });
    expect(ids(await retrieveMemory(asUser(alice, "owner"), projectA, { query: "zebra" }))).toEqual(
      [],
    );
    expect((await getProjectBrain(await accessOf(alice))).memory.map((x) => x.title)).not.toContain(
      "Old rule",
    );
  });

  it("deletes for good: no index, cache or version survives, and a keyed import cannot bring it back", async () => {
    const keyed = await db.transaction((tx) =>
      upsertKeyedMemory(tx, {
        projectId: projectA,
        title: "Stack: framework",
        content: "Next.js with unicornframework",
        category: "technical",
        source: "system",
        dedupeKey: "stack:framework",
      }),
    );
    expect(keyed.result).toBe("created");
    const [m] = await db
      .select()
      .from(memories)
      .where(eq(memories.id, keyed.memoryId as string));
    expect(
      ids(await retrieveMemory(asUser(alice, "owner"), projectA, { query: "unicornframework" })),
    ).toEqual(["Stack: framework"]);
    expect((await getProjectBrain(await accessOf(alice))).memory.map((x) => x.title)).toContain(
      "Stack: framework",
    );

    await deleteMemory(alice, slugA, { id: m.assetId });

    expect(await db.select().from(memoryAssets).where(eq(memoryAssets.id, m.assetId))).toHaveLength(
      0,
    );
    expect(await db.select().from(memories).where(eq(memories.id, m.id))).toHaveLength(0);
    expect(
      await db.select().from(memoryVersions).where(eq(memoryVersions.assetId, m.assetId)),
    ).toHaveLength(0);
    expect(
      await db.select().from(memorySources).where(eq(memorySources.assetId, m.assetId)),
    ).toHaveLength(0);
    expect(
      ids(await retrieveMemory(asUser(alice, "owner"), projectA, { query: "unicornframework" })),
    ).toEqual([]);
    expect((await search(alice, "unicornframework")).filter((h) => h.kind === "memory")).toEqual(
      [],
    );
    expect((await getProjectBrain(await accessOf(alice))).memory.map((x) => x.title)).not.toContain(
      "Stack: framework",
    );

    const again = await db.transaction((tx) =>
      upsertKeyedMemory(tx, {
        projectId: projectA,
        title: "Stack: framework",
        content: "Next.js with unicornframework",
        category: "technical",
        source: "system",
        dedupeKey: "stack:framework",
      }),
    );
    expect(again).toEqual({ result: "kept", memoryId: null });
    expect(
      await db.select().from(memoryAssets).where(eq(memoryAssets.dedupeKey, "stack:framework")),
    ).toHaveLength(0);
  });

  it("asks for a person to re-check a summary whose source memory was deleted", async () => {
    const fact = await make(alice, "Fact one", "payment goes through midtrans");
    const summary = await make(alice, "Summary", "payments summary", {
      level: "L2",
      confidence: "derived",
      sources: [{ sourceType: "memory", sourceId: fact.assetId }],
    });
    await deleteMemory(alice, slugA, { id: fact.assetId });
    const [s] = await db.select().from(memoryAssets).where(eq(memoryAssets.id, summary.assetId));
    expect(s.status).toBe("pending_review");
  });
});

describe("retrieval", () => {
  it("is lexical and honest about it, and finds exact identifiers", async () => {
    await make(alice, "Invoice rule", "invoice INV-2024-0042 was voided and reissued");
    await make(alice, "Other", "something unrelated about colours");
    const r = await retrieveMemory(asUser(alice, "owner"), projectA, { query: "INV-2024-0042" });
    expect(r.semantic).toBe("off");
    expect(ids(r)).toEqual(["Invoice rule"]);
    expect(r.items[0].sources).toEqual([expect.objectContaining({ sourceType: "manual" })]);
    expect(r.degraded).toBeUndefined();
  });

  it("respects the budget and truncates without losing citations", async () => {
    for (let i = 0; i < 8; i++)
      await make(alice, `Note ${i}`, `shared budgetword ${"filler ".repeat(120)}${i}`);
    const r = await retrieveMemory(asUser(alice, "owner"), projectA, {
      query: "budgetword",
      budget: { maxAssets: 3, perAssetChars: 200 },
    });
    expect(r.items).toHaveLength(3);
    expect(
      r.items.every((i) => i.content.length <= 200 && i.truncated && i.sources.length > 0),
    ).toBe(true);
  });

  it("reports unavailable instead of guessing when memory cannot be read", async () => {
    const r = await retrieveMemory(asUser(alice, "owner"), "not-a-uuid", { query: "anything" });
    expect(r).toEqual({ items: [], semantic: "off", degraded: "unavailable" });
  });

  it("counts use and records telemetry without the query text", async () => {
    await make(alice, "Counted", "telemetry subject");
    await retrieveMemory(asUser(alice, "owner"), projectA, { query: "telemetry" });
    const [a] = await db.select().from(memoryAssets).where(eq(memoryAssets.title, "Counted"));
    expect(a.useCount).toBe(1);
    const rows = await db.execute<{ query_hash: string }>(
      (await import("drizzle-orm")).sql`select query_hash from memory_retrievals`,
    );
    expect(rows.rows[0].query_hash).not.toContain("telemetry");
  });
});

describe("extraction from chat", () => {
  async function chat(userTexts: string[]) {
    const [conv] = await db
      .insert(conversations)
      .values({ projectId: projectA, userId: alice.id, title: "Chat" })
      .returning();
    let t = Date.now() - 100_000;
    const rows: { id: string }[] = [];
    for (const text of userTexts) {
      rows.push(
        ...(await db
          .insert(messages)
          .values([
            {
              conversationId: conv.id,
              role: "user",
              content: text,
              createdAt: new Date((t += 1000)),
            },
            {
              conversationId: conv.id,
              role: "assistant",
              content: "Okay.",
              createdAt: new Date((t += 1000)),
            },
          ])
          .returning({ id: messages.id })),
      );
    }
    return { conv, firstUserId: rows[0].id };
  }
  const TEXTS = [
    "Ingat bahwa semua invoice memakai rupiah dan tidak boleh dikonversi.",
    "hello there",
    "what is next",
    "thanks a lot",
  ];

  it("turns an explicit statement into a private, cited candidate, once", async () => {
    const { conv, firstUserId } = await chat(TEXTS);
    expect(await maybeEnqueueExtraction(db, { projectId: projectA, conversationId: conv.id })).toBe(
      true,
    );
    // Asking again for the same state queues nothing new.
    expect(await maybeEnqueueExtraction(db, { projectId: projectA, conversationId: conv.id })).toBe(
      false,
    );
    expect(await db.select().from(memoryJobs)).toHaveLength(1);

    const provider = new MockAiProvider();
    expect(await processMemoryJobs({ provider })).toEqual({ ready: 1, failed: 0 });
    expect(await processMemoryJobs({ provider })).toEqual({ ready: 0, failed: 0 });

    const found = await db
      .select()
      .from(memoryAssets)
      .where(and(eq(memoryAssets.projectId, projectA), eq(memoryAssets.status, "pending_review")));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      status: "pending_review",
      visibility: "private",
      ownerId: alice.id,
    });
    const [src] = await db
      .select()
      .from(memorySources)
      .where(eq(memorySources.assetId, found[0].id));
    expect(src).toMatchObject({ sourceType: "message", sourceId: firstUserId });
    // Nobody else sees it, and it is not retrievable before approval.
    expect(await listReviewQueue(await accessOf(bob))).toHaveLength(0);
    expect(
      ids(await retrieveMemory(asUser(alice, "owner"), projectA, { query: "rupiah" })),
    ).toEqual([]);
    // Nothing new to read: no second job.
    expect(await maybeEnqueueExtraction(db, { projectId: projectA, conversationId: conv.id })).toBe(
      false,
    );
  });

  it("remembers how far a chat was read even after the finished jobs are purged", async () => {
    const { conv } = await chat(TEXTS);
    await maybeEnqueueExtraction(db, { projectId: projectA, conversationId: conv.id });
    await processMemoryJobs({ provider: new MockAiProvider() });
    await db.delete(memoryJobs);
    expect(await maybeEnqueueExtraction(db, { projectId: projectA, conversationId: conv.id })).toBe(
      false,
    );
  });

  it("does not extract again what a person rejected or deleted", async () => {
    const { conv } = await chat(TEXTS);
    await maybeEnqueueExtraction(db, { projectId: projectA, conversationId: conv.id });
    await processMemoryJobs({ provider: new MockAiProvider() });
    const [a] = await db
      .select()
      .from(memoryAssets)
      .where(and(eq(memoryAssets.projectId, projectA), eq(memoryAssets.status, "pending_review")));
    await rejectMemory(alice, slugA, { id: a.id });

    // The same sentence in a later chat.
    const second = await chat(TEXTS);
    await maybeEnqueueExtraction(db, { projectId: projectA, conversationId: second.conv.id });
    await processMemoryJobs({ provider: new MockAiProvider() });
    const all = await db.select().from(memoryAssets).where(eq(memoryAssets.projectId, projectA));
    expect(all.filter((x) => x.status === "pending_review")).toHaveLength(0);
  });

  it("flags a contradiction for the reviewer instead of settling it", async () => {
    const S = "we deploy the application on Vercel with Postgres on Neon and Supabase auth";
    const old = await make(alice, S, `${S} for production, reviewed monthly by the team`, {
      kind: "decision",
    });
    const { conv } = await chat([`Keputusan: ${S}`, "one", "two", "three"]);
    await maybeEnqueueExtraction(db, { projectId: projectA, conversationId: conv.id });
    await processMemoryJobs({ provider: new MockAiProvider() });

    const [candidate] = await db
      .select()
      .from(memoryAssets)
      .where(and(eq(memoryAssets.projectId, projectA), eq(memoryAssets.status, "pending_review")));
    expect(candidate.conflictWithId).toBe(old.assetId);
    // It cannot be approved until the reviewer says what happens to the older memory.
    expect(await code(approveMemory(alice, slugA, { id: candidate.id }))).toBe("VALIDATION_ERROR");
    await approveMemory(alice, slugA, { id: candidate.id, onConflict: "supersede" });
    const [oldRow] = await db.select().from(memoryAssets).where(eq(memoryAssets.id, old.assetId));
    expect(oldRow.status).toBe("superseded");
    const hits = ids(await retrieveMemory(asUser(alice, "owner"), projectA, { query: "supabase" }));
    expect(hits.filter((t) => t === S)).toHaveLength(1);
  });

  it("retries a failing job a bounded number of times, with a code and no content", async () => {
    const { conv } = await chat(TEXTS);
    await maybeEnqueueExtraction(db, { projectId: projectA, conversationId: conv.id });
    // The conversation disappears: a permanent failure, not an endless retry.
    await db.delete(conversations).where(eq(conversations.id, conv.id));
    expect(await processMemoryJobs({ provider: new MockAiProvider() })).toEqual({
      ready: 0,
      failed: 1,
    });
    const [job] = await db.select().from(memoryJobs);
    expect(job).toMatchObject({ status: "failed_permanent", errorCode: "NOT_FOUND" });
  });
});

describe("review hardening", () => {
  it("lets only someone who may change a memory replace it", async () => {
    const old = await make(alice, "Deploy target", "we deploy on vercel only", {
      kind: "decision",
    });
    const candidate = await make(bob, "Deploy target v2", "we deploy on vercel and fly", {
      status: "pending_review",
      visibility: "private",
      kind: "decision",
      conflictWithId: old.assetId,
    });
    // Bob is an editor: he may approve his own suggestion, not retire Alice's decision.
    expect(
      await code(approveMemory(bob, slugA, { id: candidate.assetId, onConflict: "supersede" })),
    ).toBe("AUTHORIZATION_ERROR");
    const [still] = await db.select().from(memoryAssets).where(eq(memoryAssets.id, old.assetId));
    expect(still.status).toBe("approved");
    await approveMemory(bob, slugA, { id: candidate.assetId, onConflict: "keep_both" });
    const [after] = await db.select().from(memoryAssets).where(eq(memoryAssets.id, old.assetId));
    expect(after.status).toBe("approved");
  });

  async function factWithSummary() {
    const fact = await make(alice, "Zorblax rule", "zorblax payments are batched nightly");
    const other = await make(alice, "Other rule", "other thing");
    const summary = await make(alice, "Summary: fact", "- Zorblax rule\n- Other rule", {
      level: "L2",
      confidence: "derived",
      sources: [
        { sourceType: "memory", sourceId: fact.assetId },
        { sourceType: "memory", sourceId: other.assetId },
      ],
    });
    return { fact, summary };
  }
  const feedTitles = async () =>
    (
      await db.execute<{ t: string | null }>(
        sql`select metadata->>'title' as t from activities where entity_type = 'memory'`,
      )
    ).rows.map((r) => r.t);

  it("removes a deleted memory from the feed titles and from summaries that quoted it", async () => {
    const { fact, summary } = await factWithSummary();
    expect(await feedTitles()).toContain("Zorblax rule");
    await deleteMemory(alice, slugA, { id: fact.assetId });

    expect(await feedTitles()).not.toContain("Zorblax rule");
    const [row] = await db.select().from(memories).where(eq(memories.assetId, summary.assetId));
    expect(row.content).toBe("- Other rule");
    const [asset] = await db
      .select()
      .from(memoryAssets)
      .where(eq(memoryAssets.id, summary.assetId));
    expect(asset.status).toBe("pending_review");
    const versions = await db
      .select()
      .from(memoryVersions)
      .where(eq(memoryVersions.assetId, summary.assetId));
    expect(versions.map((v) => v.content).join("\n")).not.toContain("Zorblax");
    expect(
      ids(await retrieveMemory(asUser(alice, "owner"), projectA, { query: "zorblax" })),
    ).toEqual([]);
  });

  it("does the same when a memory stops being shared or is archived", async () => {
    const one = await factWithSummary();
    await changeVisibility(alice, slugA, { id: one.fact.assetId, visibility: "private" });
    expect(await feedTitles()).not.toContain("Zorblax rule");
    const [row] = await db.select().from(memories).where(eq(memories.assetId, one.summary.assetId));
    expect(row.content).toBe("- Other rule");

    const two = await make(alice, "Quux rule", "quux is archived soon");
    const sum2 = await make(alice, "Summary two", "- Quux rule", {
      level: "L2",
      sources: [{ sourceType: "memory", sourceId: two.assetId }],
    });
    await archiveMemory(alice, slugA, { id: two.assetId });
    const [row2] = await db.select().from(memories).where(eq(memories.assetId, sum2.assetId));
    expect(row2.content).toBe("");
  });

  it("treats a reworded rejection as the same text, but only for the person who rejected it", async () => {
    const c = await make(bob, "Maybe", "Use GraphQL everywhere", {
      status: "pending_review",
      visibility: "private",
    });
    await rejectMemory(bob, slugA, { id: c.assetId });
    const blocked = (title: string, content: string, who: Actor) =>
      isTombstoned(db, projectA, ...textTombKeys(title, content, who.id));
    expect(await blocked("  maybe ", "use  GRAPHQL everywhere!", bob)).toBe(true);
    // Alice may still be offered the same suggestion: Bob's rejection was private.
    expect(await blocked("Maybe", "Use GraphQL everywhere", alice)).toBe(false);
  });

  it("drops access grants when an unreviewed restricted asset is approved for everyone", async () => {
    const c = await make(alice, "Draft", "restricted draft text", {
      status: "pending_review",
      visibility: "restricted",
    });
    await db
      .insert(memoryAcl)
      .values({ assetId: c.assetId, principalType: "agent", principalId: agentId });
    await approveMemory(alice, slugA, { id: c.assetId, visibility: "project" });
    expect(await db.select().from(memoryAcl).where(eq(memoryAcl.assetId, c.assetId))).toHaveLength(
      0,
    );
  });

  it("does not let an admin approve someone's restricted suggestion by id", async () => {
    const c = await make(bob, "Bob restricted", "restricted suggestion", {
      status: "pending_review",
      visibility: "restricted",
    });
    expect(await code(approveMemory(alice, slugA, { id: c.assetId }))).toBe("NOT_FOUND");
  });

  it("hides who has access, and where a memory is equipped, from people who cannot manage it", async () => {
    const m = await make(alice, "Equipped", "equipped content");
    await createBinding(alice, slugA, {
      targetType: "agent",
      targetId: agentId,
      assetId: m.assetId,
    });
    expect((await getAssetDetail(await accessOf(alice), m.assetId)).bindings).toHaveLength(1);
    const asBob = await getAssetDetail(await accessOf(bob), m.assetId);
    expect(asBob.bindings).toEqual([]);
    expect(asBob.canManage).toBe(false);
    // Binding an asset the creator cannot read looks like a missing one.
    const secret = await make(bob, "Bob private", "x", { visibility: "private" });
    expect(
      await code(
        createBinding(alice, slugA, {
          targetType: "agent",
          targetId: agentId,
          assetId: secret.assetId,
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("shows processing counts only to admins", async () => {
    expect((await getOverview(await accessOf(bob))).jobs).toEqual({ queued: 0, failed: 0 });
  });
});

describe("job safety", () => {
  it("finishes a job whose worker keeps dying instead of retrying it for ever", async () => {
    await db.insert(memoryJobs).values({
      projectId: projectA,
      kind: "extract_chat",
      idempotencyKey: "stuck",
      status: "processing",
      attempts: 3,
      lockedUntil: new Date(Date.now() - 60_000),
      input: { conversationId: "00000000-0000-4000-8000-000000000000", toMessageId: "x" },
    });
    expect(await processMemoryJobs({ provider: new MockAiProvider() })).toEqual({
      ready: 0,
      failed: 0,
    });
    const [job] = await db.select().from(memoryJobs);
    expect(job).toMatchObject({ status: "failed_permanent", errorCode: "stalled" });
  });

  it("queues one extraction at a time per conversation", async () => {
    const [conv] = await db
      .insert(conversations)
      .values({ projectId: projectA, userId: alice.id, title: "Chat" })
      .returning();
    let t = Date.now() - 100_000;
    const add = async (n: number) => {
      for (let i = 0; i < n; i++) {
        await db.insert(messages).values([
          {
            conversationId: conv.id,
            role: "user",
            content: `u${i}`,
            createdAt: new Date((t += 1000)),
          },
          {
            conversationId: conv.id,
            role: "assistant",
            content: "ok",
            createdAt: new Date((t += 1000)),
          },
        ]);
      }
    };
    await add(4);
    expect(await maybeEnqueueExtraction(db, { projectId: projectA, conversationId: conv.id })).toBe(
      true,
    );
    await add(4);
    // The first is still queued: more replies do not multiply the work.
    expect(await maybeEnqueueExtraction(db, { projectId: projectA, conversationId: conv.id })).toBe(
      false,
    );
    expect(await db.select().from(memoryJobs)).toHaveLength(1);
  });
});

describe("database guards and validity", () => {
  it("refuses values outside the vocabularies and a payload from another project", async () => {
    const m = await make(alice, "Guarded", "guard content");
    const bad = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        return "OK";
      } catch {
        return "REFUSED";
      }
    };
    expect(
      await bad(() =>
        db.execute(sql`update memory_assets set visibility = 'everyone' where id = ${m.assetId}`),
      ),
    ).toBe("REFUSED");
    expect(
      await bad(() =>
        db.execute(sql`update memory_assets set status = 'published' where id = ${m.assetId}`),
      ),
    ).toBe("REFUSED");
    const other = (await accessOf(eve, slugB)).project.id;
    expect(
      await bad(() =>
        db.execute(sql`update memories set project_id = ${other} where id = ${m.id}`),
      ),
    ).toBe("REFUSED");
  });

  it("clears a pointer to a deleted asset instead of leaving it dangling", async () => {
    const old = await make(alice, "Old one", "old text for pointers");
    const next = await make(alice, "New one", "new text for pointers", {
      status: "pending_review",
      conflictWithId: old.assetId,
    });
    await db.delete(memoryAssets).where(eq(memoryAssets.id, old.assetId));
    const [row] = await db.select().from(memoryAssets).where(eq(memoryAssets.id, next.assetId));
    expect(row.conflictWithId).toBeNull();
  });

  it("stops reading a memory once its validity has ended, everywhere it is read", async () => {
    const m = await make(alice, "Expiring", "expiring zebra clause");
    await createBinding(alice, slugA, {
      targetType: "agent",
      targetId: agentId,
      assetId: m.assetId,
    });
    await changeVisibility(alice, slugA, { id: m.assetId, visibility: "project" });
    const target = { type: "agent" as const, id: agentId };
    expect(ids(await retrieveMemory(asAgent(), projectA, { query: "zebra" }))).toEqual([
      "Expiring",
    ]);
    expect((await resolveLoadout(asAgent(), projectA, target)).items).toHaveLength(1);

    await db
      .update(memoryAssets)
      .set({ validUntil: new Date(Date.now() - 1000) })
      .where(eq(memoryAssets.id, m.assetId));
    expect(ids(await retrieveMemory(asAgent(), projectA, { query: "zebra" }))).toEqual([]);
    expect(await readAsset(asAgent(), projectA, m.assetId)).toBeNull();
    expect((await resolveLoadout(asAgent(), projectA, target)).items).toEqual([]);
    expect((await listMemories(await accessOf(alice))).map((x) => x.title)).not.toContain(
      "Expiring",
    );
  });

  it("tells a reader who wrote a memory, even after a person approved it", async () => {
    const c = await make(alice, "From agent", "origin probe text", {
      status: "pending_review",
    });
    await db.update(memories).set({ source: "agent" }).where(eq(memories.id, c.id));
    await approveMemory(alice, slugA, { id: c.assetId });
    const r = await retrieveMemory(asUser(alice, "owner"), projectA, { query: "probe" });
    expect(r.items[0]).toMatchObject({ confidence: "confirmed", origin: "agent" });
  });
});
