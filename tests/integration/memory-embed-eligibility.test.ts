import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  documents,
  memories,
  memoryAssets,
  memoryEmbeddings,
  memoryJobs,
  platformAiSettings,
  projectSettings,
  wikiChunks,
  wikiSources,
} from "@/lib/db/schema";
import { USER_TRACE } from "@/lib/events/types";
import { enqueueEmbedProject, requeueAllEmbeddings } from "@/lib/memory/embed/enqueue";
import { reconcileProject, sweepDisabledEmbeddings } from "@/lib/memory/embed/reconcile";
import { CONSENT_VERSION, setSemanticSearch } from "@/lib/memory/embed/settings";
import { processMemoryJobs } from "@/lib/memory/jobs";
import { enqueue } from "@/lib/memory/queue";
import { createMemoryTx } from "@/lib/memory/service";
import { syncWikiFromDocuments } from "@/lib/memory/wiki";
import { createUser, resetDatabase } from "../helpers/db";
import { installEmbeddingModel, removeEmbeddingModel } from "../helpers/embedding-model";
import { fakeEmbedder, wordVector } from "../helpers/fake-embedder";
import { project } from "../helpers/project";

let alice: Actor;
let bob: Actor;
let slug: string;
let projectId: string;
let modelId: string;

const accessOf = (a: Actor, s = slug) => loadProjectAccess(a, { slug: s }, "project:read");

async function make(title: string, content: string) {
  const access = await accessOf(alice);
  return db.transaction((tx) =>
    createMemoryTx(
      tx,
      access,
      { title, content, category: "product", importance: "normal" },
      USER_TRACE,
      {
        visibility: "project",
      },
    ),
  );
}
const vectors = () =>
  db.select().from(memoryEmbeddings).where(eq(memoryEmbeddings.projectId, projectId));
const vectorsOf = async (assetId: string) => (await vectors()).filter((r) => r.assetId === assetId);
/** Only the memories made by a test count: the journal memories of a new project are put aside. */
const setAside = () =>
  db
    .update(memoryAssets)
    .set({ visibility: "private" })
    .where(eq(memoryAssets.projectId, projectId));

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  bob = await createUser("Bob");
  slug = await project(alice, "A web shop with login and payments for my bakery.");
  projectId = (await accessOf(alice)).project.id;
  modelId = await installEmbeddingModel();
  await setSemanticSearch(alice, slug, { enabled: true, consent: CONSENT_VERSION });
});
afterEach(removeEmbeddingModel);

describe("what is eligible", () => {
  it("embeds only approved, unexpired, project-visible memory", async () => {
    await setAside();
    const ok = await make("Eligible", "shared hosting note");
    const cases: Record<string, Partial<typeof memoryAssets.$inferInsert>> = {
      candidate: { status: "candidate" },
      pending: { status: "pending_review" },
      expired: { validUntil: new Date(Date.now() - 60_000) },
      restricted: { visibility: "restricted" },
      agent: { visibility: "agent" },
    };
    const ids: string[] = [];
    for (const [name, patch] of Object.entries(cases)) {
      const m = await make(`Case ${name}`, `content of ${name}`);
      await db.update(memoryAssets).set(patch).where(eq(memoryAssets.id, m.assetId));
      ids.push(m.assetId);
    }
    await reconcileProject(projectId, { override: fakeEmbedder(modelId) });
    expect(await vectorsOf(ok.assetId)).toHaveLength(1);
    const rows = await vectors();
    expect(rows.some((r) => r.assetId && ids.includes(r.assetId))).toBe(false);
  });

  it("embeds the chunks of a ready, approved wiki source and drops them when it is not ready", async () => {
    await setAside();
    await db.insert(documents).values({
      projectId,
      type: "custom",
      title: "Guide",
      slug: "guide",
      content:
        "# Guide\n\nIntro text.\n\n## Refunds\n\nRefunds return in 7 days.\n\n## Taxes\n\nTax at checkout.\n",
    });
    await syncWikiFromDocuments(projectId);
    const chunks = await db.select({ id: wikiChunks.id }).from(wikiChunks);
    expect(chunks.length).toBeGreaterThan(1);
    const embedder = fakeEmbedder(modelId);
    await reconcileProject(projectId, { override: embedder });
    const onChunks = async () =>
      (await vectors()).filter((r) => r.chunkId && chunks.some((c) => c.id === r.chunkId));
    expect(await onChunks()).toHaveLength(chunks.length);

    await db
      .update(wikiSources)
      .set({ status: "failed" })
      .where(eq(wikiSources.projectId, projectId));
    await reconcileProject(projectId, { override: embedder });
    expect(await onChunks()).toHaveLength(0);
  });

  it("embeds only the first 6000 characters, and the hash is stable across runs", async () => {
    await setAside();
    const long = await make("Long note", "placeholder");
    await db
      .update(memories)
      .set({ content: "word ".repeat(2000) })
      .where(eq(memories.assetId, long.assetId));
    const seen: string[] = [];
    const embedder = fakeEmbedder(modelId, { onCall: (t) => seen.push(...t) });
    await reconcileProject(projectId, { override: embedder });
    expect(seen).toHaveLength(1);
    expect(seen[0].length).toBeLessThanOrEqual(6000);
    const [first] = await vectorsOf(long.assetId);
    await reconcileProject(projectId, { override: embedder });
    expect(seen).toHaveLength(1); // nothing was sent the second time
    expect((await vectorsOf(long.assetId))[0].contentHash).toBe(first.contentHash);
  });
});

describe("a model change", () => {
  it("re-embeds everything with the new model and keeps none of the old", async () => {
    await make("Hosting", "The client covers the Vercel bill");
    await reconcileProject(projectId, { override: fakeEmbedder(modelId) });
    const before = await vectors();
    expect(before.length).toBeGreaterThan(0);

    const next = await installEmbeddingModel();
    expect(next).not.toBe(modelId);
    const out = await reconcileProject(projectId, { override: fakeEmbedder(next) });
    const after = await vectors();
    expect(after).toHaveLength(before.length);
    expect(after.every((r) => r.modelId === next)).toBe(true);
    expect(out.removed).toBe(before.length);
  });
});

describe("batching and follow-up", () => {
  it("splits calls, caps a run, and a follow-up job finishes the rest", async () => {
    await setAside();
    for (let i = 1; i <= 5; i++) await make(`Memo ${i}`, `distinct content number ${i}`);
    const calls: number[] = [];
    const embedder = fakeEmbedder(modelId, { onCall: (t) => calls.push(t.length) });
    const limits = { batch: 2, perRun: 4 };
    const first = await reconcileProject(projectId, { override: embedder, limits });
    expect(calls).toEqual([2, 2]);
    expect(first.embedded).toBe(4);
    expect(first.remaining).toBe(1);
    expect(await vectors()).toHaveLength(4);

    await db.delete(memoryEmbeddings).where(eq(memoryEmbeddings.projectId, projectId));
    await db.delete(memoryJobs).where(eq(memoryJobs.projectId, projectId));
    await enqueueEmbedProject(db, projectId);
    // The follow-up job is taken by the same call, not left for the cron.
    await processMemoryJobs({ embedder, embedLimits: limits });
    expect(await vectors()).toHaveLength(5);
    const jobs = await db.select().from(memoryJobs).where(eq(memoryJobs.kind, "embed_project"));
    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => j.status === "ready")).toBe(true);
  });
});

describe("triggers and sweeps", () => {
  it("requeueAllEmbeddings queues only projects that opted in", async () => {
    const other = await project(bob, "A recipe sharing app for home cooks and friends.");
    const otherId = (await accessOf(bob, other)).project.id;
    await db.delete(memoryJobs);
    expect(await requeueAllEmbeddings()).toBe(1);
    const jobs = await db.select().from(memoryJobs).where(eq(memoryJobs.kind, "embed_project"));
    expect(jobs.map((j) => j.projectId)).toEqual([projectId]);
    expect(jobs.some((j) => j.projectId === otherId)).toBe(false);
  });

  it("deletes the project's vectors when the Owner chooses no embedding model", async () => {
    await make("Hosting", "The client covers the Vercel bill");
    await reconcileProject(projectId, { override: fakeEmbedder(modelId) });
    const total = (await vectors()).length;
    expect(total).toBeGreaterThan(0);
    // "None" in AI & Models: the model row stays, the platform setting is cleared.
    await db
      .update(platformAiSettings)
      .set({ embeddingModelId: null })
      .where(eq(platformAiSettings.id, 1));
    const out = await reconcileProject(projectId);
    expect(out).toMatchObject({ skipped: "no_model", removed: total, embedded: 0 });
    expect(await vectors()).toHaveLength(0);
  });

  it("sweepDisabledEmbeddings deletes vectors of a project that is not opted in", async () => {
    await make("Hosting", "The client covers the Vercel bill");
    await reconcileProject(projectId, { override: fakeEmbedder(modelId) });
    const total = (await vectors()).length;
    expect(total).toBeGreaterThan(0);
    expect(await sweepDisabledEmbeddings()).toBe(0); // opted in: nothing to sweep

    await db
      .update(projectSettings)
      .set({ semanticSearchEnabled: false })
      .where(eq(projectSettings.projectId, projectId));
    expect(await sweepDisabledEmbeddings()).toBe(total);
    expect(await vectors()).toHaveLength(0);

    await db
      .update(projectSettings)
      .set({ semanticSearchEnabled: true })
      .where(eq(projectSettings.projectId, projectId));
    await reconcileProject(projectId, { override: fakeEmbedder(modelId) });
    await db.delete(projectSettings).where(eq(projectSettings.projectId, projectId));
    expect(await sweepDisabledEmbeddings()).toBe(total);
  });

  it("the index_wiki job queues an embed job for an opted-in project", async () => {
    await db.delete(memoryJobs);
    await enqueue(db, {
      projectId,
      kind: "index_wiki",
      key: `wiki:${projectId}:t`,
      data: { projectId },
    });
    await processMemoryJobs({ embedder: fakeEmbedder(modelId), limit: 1 });
    const jobs = await db
      .select()
      .from(memoryJobs)
      .where(inArray(memoryJobs.kind, ["embed_project"]));
    expect(jobs).toHaveLength(1);
    // Taken by the same call, not left for the cron.
    expect(jobs[0].status).toBe("ready");
  });
});

describe("changes during a run", () => {
  const racing = (mutate: () => Promise<unknown>) => ({
    modelId: "",
    embed: async (texts: readonly string[]) => {
      await mutate();
      return texts.map(wordVector);
    },
  });

  it("writes no vector for an asset that turned private while the provider ran", async () => {
    const memo = await make("Hosting", "The client covers the Vercel bill");
    const embedder = {
      ...racing(() =>
        db
          .update(memoryAssets)
          .set({ visibility: "private" })
          .where(eq(memoryAssets.id, memo.assetId)),
      ),
      modelId,
    };
    await reconcileProject(projectId, { override: embedder });
    expect(await vectorsOf(memo.assetId)).toHaveLength(0);
  });

  it("writes no vector for an asset that expired while the provider ran", async () => {
    const memo = await make("Hosting", "The client covers the Vercel bill");
    const embedder = {
      ...racing(() =>
        db
          .update(memoryAssets)
          .set({ validUntil: new Date(Date.now() - 60_000) })
          .where(eq(memoryAssets.id, memo.assetId)),
      ),
      modelId,
    };
    await reconcileProject(projectId, { override: embedder });
    expect(await vectorsOf(memo.assetId)).toHaveLength(0);
  });

  it("writes no vector for a project that withdrew consent while the provider ran", async () => {
    await make("Hosting", "The client covers the Vercel bill");
    const embedder = {
      ...racing(() => setSemanticSearch(alice, slug, { enabled: false })),
      modelId,
    };
    await reconcileProject(projectId, { override: embedder });
    expect(await vectors()).toHaveLength(0);
  });
});
