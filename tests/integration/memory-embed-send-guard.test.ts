import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { memoryAssets, memoryEmbeddings } from "@/lib/db/schema";
import { USER_TRACE } from "@/lib/events/types";
import { reconcileProject } from "@/lib/memory/embed/reconcile";
import { CONSENT_VERSION, setSemanticSearch } from "@/lib/memory/embed/settings";
import { createMemoryTx } from "@/lib/memory/service";
import { createUser, resetDatabase } from "../helpers/db";
import { installEmbeddingModel, removeEmbeddingModel } from "../helpers/embedding-model";
import { wordVector } from "../helpers/fake-embedder";
import { project } from "../helpers/project";

// What reaches the provider: consent and eligibility are read again right before each call.
let alice: Actor;
let slug: string;
let projectId: string;
let modelId: string;
const limits = { batch: 2, perRun: 4 };

const make = async (title: string) => {
  const access = await loadProjectAccess(alice, { slug }, "project:read");
  return db.transaction((tx) =>
    createMemoryTx(
      tx,
      access,
      { title, content: `body of ${title}`, category: "product", importance: "normal" },
      USER_TRACE,
      { visibility: "project" },
    ),
  );
};
const vectors = () =>
  db.select().from(memoryEmbeddings).where(eq(memoryEmbeddings.projectId, projectId));

/** Four eligible memories; the journal memories of a new project are put aside. */
async function fourMemos() {
  await db
    .update(memoryAssets)
    .set({ visibility: "private" })
    .where(eq(memoryAssets.projectId, projectId));
  const memos = [];
  for (const n of ["alpha", "bravo", "charlie", "delta"]) memos.push({ ...(await make(n)), n });
  return memos;
}

/** An embedder that records what it is sent and runs `onFirst` while the first batch is in flight. */
function spy(onFirst?: (first: readonly string[]) => Promise<unknown>) {
  const calls: string[][] = [];
  return {
    calls,
    embedder: {
      modelId,
      embed: async (texts: readonly string[]) => {
        calls.push([...texts]);
        if (calls.length === 1) await onFirst?.(texts);
        return texts.map(wordVector);
      },
    },
  };
}
const sentText = (calls: string[][]) => calls.flat().join("\n");

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  slug = await project(alice, "A web shop with login and payments for my bakery.");
  projectId = (await loadProjectAccess(alice, { slug }, "project:read")).project.id;
  modelId = await installEmbeddingModel();
  await setSemanticSearch(alice, slug, { enabled: true, consent: CONSENT_VERSION });
});
afterEach(removeEmbeddingModel);

describe("the send guard", () => {
  it("sends every eligible text exactly once when nothing changes", async () => {
    await fourMemos();
    const { calls, embedder } = spy();
    await reconcileProject(projectId, { override: embedder, limits });
    expect(calls.map((c) => c.length)).toEqual([2, 2]);
    for (const n of ["alpha", "bravo", "charlie", "delta"])
      expect(calls.flat().filter((t) => t.includes(`body of ${n}`))).toHaveLength(1);
    expect(await vectors()).toHaveLength(4);
  });

  it("sends nothing more once the project switched off during the first batch", async () => {
    await fourMemos();
    const { calls, embedder } = spy(() => setSemanticSearch(alice, slug, { enabled: false }));
    const out = await reconcileProject(projectId, { override: embedder, limits });
    expect(calls).toHaveLength(1);
    expect(await vectors()).toHaveLength(0);
    expect(out.embedded).toBe(0);
    expect(out.remaining).toBe(0);
  });

  it("does not send an asset of the second batch that became private meanwhile", async () => {
    const memos = await fourMemos();
    let victim = "";
    const { calls, embedder } = spy(async (first) => {
      const later = memos.find((m) => !first.some((t) => t.includes(`body of ${m.n}`)));
      if (!later) throw new Error("no second batch");
      victim = later.n;
      await db
        .update(memoryAssets)
        .set({ visibility: "private" })
        .where(eq(memoryAssets.id, later.assetId));
    });
    await reconcileProject(projectId, { override: embedder, limits });
    expect(victim).not.toBe("");
    expect(sentText(calls)).not.toContain(`body of ${victim}`);
    const id = memos.find((m) => m.n === victim)?.assetId;
    expect((await vectors()).filter((r) => r.assetId === id)).toHaveLength(0);
    expect(await vectors()).toHaveLength(3);
  });

  it("does not send an asset of the second batch that expired meanwhile", async () => {
    const memos = await fourMemos();
    let victim = "";
    const { calls, embedder } = spy(async (first) => {
      const later = memos.find((m) => !first.some((t) => t.includes(`body of ${m.n}`)));
      if (!later) throw new Error("no second batch");
      victim = later.n;
      await db
        .update(memoryAssets)
        .set({ validUntil: new Date(Date.now() - 60_000) })
        .where(eq(memoryAssets.id, later.assetId));
    });
    await reconcileProject(projectId, { override: embedder, limits });
    expect(sentText(calls)).not.toContain(`body of ${victim}`);
    const id = memos.find((m) => m.n === victim)?.assetId;
    expect((await vectors()).filter((r) => r.assetId === id)).toHaveLength(0);
  });

  it("skips the provider call when every text of a batch became ineligible", async () => {
    const memos = await fourMemos();
    const { calls, embedder } = spy(async (first) => {
      for (const m of memos.filter((x) => !first.some((t) => t.includes(`body of ${x.n}`))))
        await db
          .update(memoryAssets)
          .set({ visibility: "private" })
          .where(eq(memoryAssets.id, m.assetId));
    });
    await reconcileProject(projectId, { override: embedder, limits });
    expect(calls).toHaveLength(1);
  });
});
