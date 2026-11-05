import { and, eq, inArray, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { documents, memoryAssets, wikiChunks, wikiSources } from "@/lib/db/schema";
import { USER_TRACE } from "@/lib/events/types";
import { reconcileProject } from "@/lib/memory/embed/reconcile";
import { CONSENT_VERSION, setSemanticSearch } from "@/lib/memory/embed/settings";
import type { Principal } from "@/lib/memory/policy";
import { nearestAssets, nearestChunks } from "@/lib/memory/retrieval/vector";
import { notExpired, visibleWhere } from "@/lib/memory/scope";
import { createMemoryTx } from "@/lib/memory/service";
import { syncWikiFromDocuments } from "@/lib/memory/wiki";
import { createUser, resetDatabase } from "../helpers/db";
import { installEmbeddingModel, removeEmbeddingModel } from "../helpers/embedding-model";
import { conceptVector, fakeEmbedder } from "../helpers/fake-embedder";
import { project } from "../helpers/project";

// The vector queries must apply the caller's access filter themselves: a second check later
// would hide the rows, but unreadable rows could fill the result slots first.
const CONCEPT = 7;
const vector = conceptVector(CONCEPT);

let alice: Actor;
let projectId: string;
let slug: string;
let modelId: string;
let principal: Principal;

// The filters are built the way retrieval/engine.ts and wiki/retrieve.ts build them.
const assetBase = () =>
  and(
    visibleWhere(principal, projectId, ["approved"]),
    inArray(memoryAssets.assetType, ["chat"]),
    notExpired(),
  );
const chunkBase = () =>
  and(
    visibleWhere(principal, projectId, ["approved"]),
    eq(memoryAssets.assetType, "wiki"),
    notExpired(),
    eq(wikiSources.status, "ready"),
  );

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  slug = await project(alice, "A web shop with login and payments for my bakery.");
  const access = await loadProjectAccess(alice, { slug }, "project:read");
  projectId = access.project.id;
  principal = { kind: "user", userId: alice.id, role: "owner" };
  modelId = await installEmbeddingModel();
  await setSemanticSearch(alice, slug, { enabled: true, consent: CONSENT_VERSION });
  await db
    .update(memoryAssets)
    .set({ visibility: "private" })
    .where(eq(memoryAssets.projectId, projectId));
  await db.transaction((tx) =>
    createMemoryTx(
      tx,
      access,
      { title: "Zebra", content: "zebra note", category: "product", importance: "normal" },
      USER_TRACE,
      { visibility: "project" },
    ),
  );
  await db.insert(documents).values({
    projectId,
    type: "custom",
    title: "Guide",
    slug: "guide",
    content: "# Guide\n\n## Zebra\n\nzebra passage\n",
  });
  await syncWikiFromDocuments(projectId);
  await reconcileProject(projectId, {
    override: fakeEmbedder(modelId, { concepts: { zebra: CONCEPT } }),
  });
});
afterEach(removeEmbeddingModel);

describe("nearestAssets", () => {
  it("returns the asset under the real access filter", async () => {
    expect(await nearestAssets(assetBase(), projectId, modelId, vector)).toHaveLength(1);
  });

  it("returns nothing when the access filter excludes it", async () => {
    expect(await nearestAssets(sql`false`, projectId, modelId, vector)).toEqual([]);
  });

  it("returns nothing for vectors of another model", async () => {
    expect(
      await nearestAssets(assetBase(), projectId, await installEmbeddingModel(), vector),
    ).toEqual([]);
  });
});

describe("nearestChunks", () => {
  it("returns the chunk under the real access filter", async () => {
    const ids = await nearestChunks(chunkBase(), projectId, modelId, vector);
    const chunks = await db.select({ id: wikiChunks.id }).from(wikiChunks);
    expect(ids.length).toBeGreaterThan(0);
    expect(chunks.map((c) => c.id)).toEqual(expect.arrayContaining(ids));
  });

  it("returns nothing when the access filter excludes it", async () => {
    expect(await nearestChunks(sql`false`, projectId, modelId, vector)).toEqual([]);
  });

  it("does not return vectors of another model", async () => {
    expect(
      await nearestChunks(chunkBase(), projectId, await installEmbeddingModel(), vector),
    ).toEqual([]);
  });
});
