import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { memoryAssets, memoryEmbeddings, projectMembers } from "@/lib/db/schema";
import { USER_TRACE } from "@/lib/events/types";
import { CONSENT_VERSION, setSemanticSearch } from "@/lib/memory/embed/settings";
import { processMemoryJobs } from "@/lib/memory/jobs";
import type { Principal } from "@/lib/memory/policy";
import { getOverview } from "@/lib/memory/queries";
import { retrieveMemory } from "@/lib/memory/retrieval/engine";
import { createMemoryTx } from "@/lib/memory/service";
import { createUser, resetDatabase } from "../helpers/db";
import { installEmbeddingModel, removeEmbeddingModel } from "../helpers/embedding-model";
import { fakeEmbedder } from "../helpers/fake-embedder";
import { project } from "../helpers/project";

let alice: Actor;
let bob: Actor;
let eve: Actor;
let slugA: string;
let slugB: string;
let projectA: string;
let projectB: string;
let modelId: string;

const asUser = (a: Actor, role: "owner" | "editor" = "editor"): Principal => ({
  kind: "user",
  userId: a.id,
  role,
});
const accessOf = (a: Actor, slug: string) => loadProjectAccess(a, { slug }, "project:read");
const titles = (r: { items: { title: string }[] }) => r.items.map((i) => i.title);

async function make(
  a: Actor,
  slug: string,
  title: string,
  content: string,
  visibility: "project" | "private" = "project",
) {
  const access = await accessOf(a, slug);
  return db.transaction((tx) =>
    createMemoryTx(
      tx,
      access,
      { title, content, category: "product", importance: "normal" },
      USER_TRACE,
      { visibility },
    ),
  );
}

// "who pays for infrastructure costs" and the hosting note mean the same thing and share no word.
const CONCEPTS = { "infrastructure costs": 7, "vercel bill": 7, "tax rules": 9 };
let embedder = fakeEmbedder("");

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  bob = await createUser("Bob");
  eve = await createUser("Eve");
  slugA = await project(alice, "A web shop with login and payments for my bakery.");
  slugB = await project(eve, "A recipe sharing app for home cooks and friends.");
  projectA = (await accessOf(alice, slugA)).project.id;
  projectB = (await accessOf(eve, slugB)).project.id;
  await db.insert(projectMembers).values({ projectId: projectA, userId: bob.id, role: "editor" });
  modelId = await installEmbeddingModel();
  embedder = fakeEmbedder(modelId, { concepts: CONCEPTS });
});
afterEach(removeEmbeddingModel);

const enable = async (a: Actor, slug: string) => {
  await setSemanticSearch(a, slug, { enabled: true, consent: CONSENT_VERSION });
  await processMemoryJobs({ embedder });
};

describe("semantic retrieval", () => {
  it("finds a memory by meaning when no word matches, and says semantic is on", async () => {
    await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
    await make(alice, slugA, "Colours", "Brand blue and warm white");
    await enable(alice, slugA);
    const result = await retrieveMemory(asUser(bob), projectA, {
      query: "who pays for infrastructure costs",
      embedder,
    });
    expect(result.semantic).toBe("on");
    expect(titles(result)).toContain("Hosting");
    expect(titles(result)).not.toContain("Colours");
  });

  it("says off and still answers by words when the project did not opt in", async () => {
    await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
    const result = await retrieveMemory(asUser(bob), projectA, { query: "Vercel bill", embedder });
    expect(result.semantic).toBe("off");
    expect(titles(result)).toContain("Hosting");
    const byMeaning = await retrieveMemory(asUser(bob), projectA, {
      query: "who pays for infrastructure costs",
      embedder,
    });
    expect(titles(byMeaning)).not.toContain("Hosting");
  });

  it("falls back to words and says degraded when the provider fails", async () => {
    await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
    await enable(alice, slugA);
    const down = fakeEmbedder(modelId, { concepts: CONCEPTS, fail: true });
    const result = await retrieveMemory(asUser(bob), projectA, {
      query: "Vercel bill",
      embedder: down,
    });
    expect(result.semantic).toBe("degraded");
    expect(titles(result)).toContain("Hosting");
  });

  it("answers by words and says degraded when the provider never answers", async () => {
    await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
    await enable(alice, slugA);
    // Ignores the abort signal too: only the retrieval's own cap can end the wait.
    const hung = { modelId, embed: () => new Promise<number[][]>(() => {}) };
    const started = Date.now();
    const result = await retrieveMemory(asUser(bob), projectA, {
      query: "Vercel bill",
      embedder: hung,
      budget: { timeoutMs: 1000 },
    });
    expect(result.degraded).toBeUndefined();
    expect(result.semantic).toBe("degraded");
    expect(titles(result)).toContain("Hosting");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("never returns another project's memory, even with the identical meaning", async () => {
    await make(alice, slugA, "Hosting A", "The client covers the Vercel bill");
    await make(eve, slugB, "Hosting B", "Customers pay the Vercel bill themselves");
    await enable(alice, slugA);
    await enable(eve, slugB);
    const a = await retrieveMemory(asUser(bob), projectA, {
      query: "who pays for infrastructure costs",
      embedder,
    });
    expect(titles(a)).toContain("Hosting A");
    expect(titles(a)).not.toContain("Hosting B");
    const b = await retrieveMemory(asUser(eve, "owner"), projectB, {
      query: "who pays for infrastructure costs",
      embedder,
    });
    expect(titles(b)).toContain("Hosting B");
    expect(titles(b)).not.toContain("Hosting A");
  });

  it("does not find a private memory by meaning, because it was never embedded", async () => {
    const made = await make(
      alice,
      slugA,
      "Vendor price",
      "The Vercel bill we negotiated",
      "private",
    );
    await enable(alice, slugA);
    const rows = await db
      .select()
      .from(memoryEmbeddings)
      .where(eq(memoryEmbeddings.projectId, projectA));
    expect(rows.some((r) => r.assetId === made.assetId)).toBe(false);
    const result = await retrieveMemory(asUser(alice, "owner"), projectA, {
      query: "who pays for infrastructure costs",
      embedder,
    });
    expect(titles(result)).not.toContain("Vendor price");
  });

  it("applies the access filter to the vector list: an agent without memory access gets nothing", async () => {
    await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
    await enable(alice, slugA);
    const agent: Principal = {
      kind: "agent",
      agentId: "00000000-0000-4000-8000-000000000001",
      creatorId: alice.id,
      canReadMemory: false,
    };
    const result = await retrieveMemory(agent, projectA, {
      query: "who pays for infrastructure costs",
      embedder,
    });
    expect(result.items).toEqual([]);
  });

  it("applies the access filter at query time: a vector of a memory made private later is not returned", async () => {
    const made = await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
    await enable(alice, slugA);
    await db
      .update(memoryAssets)
      .set({ visibility: "private" })
      .where(eq(memoryAssets.id, made.assetId));
    const result = await retrieveMemory(asUser(bob), projectA, {
      query: "who pays for infrastructure costs",
      embedder,
    });
    expect(titles(result)).not.toContain("Hosting");
  });
});

describe("what the vector list refuses", () => {
  const ask = (q = "who pays for infrastructure costs", e = embedder) =>
    retrieveMemory(asUser(bob), projectA, { query: q, embedder: e });

  it("does not compare vectors of another model with the query vector", async () => {
    await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
    await enable(alice, slugA);
    expect(titles(await ask())).toContain("Hosting");
    // A second model becomes the platform's; the reconcile has not run, so only old-model vectors exist.
    const modelY = await installEmbeddingModel();
    const embedderY = fakeEmbedder(modelY, { concepts: CONCEPTS });
    const result = await ask(undefined, embedderY);
    expect(result.semantic).toBe("on");
    expect(titles(result)).not.toContain("Hosting");
  });

  it.each(["pending_review", "rejected"] as const)(
    "does not return a memory whose status became %s after it was embedded",
    async (status) => {
      const made = await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
      await enable(alice, slugA);
      expect(titles(await ask())).toContain("Hosting");
      await db.update(memoryAssets).set({ status }).where(eq(memoryAssets.id, made.assetId));
      expect(titles(await ask())).not.toContain("Hosting");
    },
  );

  it("does not return a memory whose validity ended after it was embedded", async () => {
    const made = await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
    await enable(alice, slugA);
    expect(titles(await ask())).toContain("Hosting");
    await db
      .update(memoryAssets)
      .set({ validUntil: new Date(Date.now() - 60_000) })
      .where(eq(memoryAssets.id, made.assetId));
    expect(titles(await ask())).not.toContain("Hosting");
  });
});

describe("the overview", () => {
  it("shows off, then indexing, then on", async () => {
    const access = await accessOf(alice, slugA);
    const off = (await getOverview(access)).semantic;
    expect(off.state).toBe("off");
    // The consent dialog names the provider the text would go to.
    expect(off.provider).toMatch(/^Embed test /);
    await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
    await setSemanticSearch(alice, slugA, { enabled: true, consent: CONSENT_VERSION });
    const indexing = (await getOverview(access)).semantic;
    expect(indexing.state).toBe("indexing");
    expect(indexing.indexed).toBe(0);
    expect(indexing.total).toBeGreaterThan(0);
    await processMemoryJobs({ embedder });
    const on = (await getOverview(access)).semantic;
    expect(on.state).toBe("on");
    expect(on.indexed).toBe(on.total);
  });
});
