import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { processProjectChanges } from "@/lib/brain/process";
import { db } from "@/lib/db/client";
import {
  auditEvents,
  memories,
  memoryAssets,
  memoryEmbeddings,
  memoryJobs,
  projectSettings,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { USER_TRACE } from "@/lib/events/types";
import { enqueueEmbedProject } from "@/lib/memory/embed/enqueue";
import { reconcileProject } from "@/lib/memory/embed/reconcile";
import { CONSENT_VERSION, setSemanticSearch } from "@/lib/memory/embed/settings";
import { processMemoryJobs } from "@/lib/memory/jobs";
import { createMemoryTx } from "@/lib/memory/service";
import { createUser, resetDatabase } from "../helpers/db";
import { installEmbeddingModel, removeEmbeddingModel } from "../helpers/embedding-model";
import { fakeEmbedder } from "../helpers/fake-embedder";
import { project } from "../helpers/project";

let alice: Actor; // owner of the project
let bob: Actor; // editor: may not switch semantic search on
let slug: string;
let projectId: string;
let modelId: string;

const accessOf = (a: Actor) => loadProjectAccess(a, { slug }, "project:read");
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError
      ? `${e.code}:${Object.values(e.fields ?? {})[0] ?? ""}`
      : String(e);
  }
};

async function make(title: string, content: string, visibility: "project" | "private" = "project") {
  const access = await accessOf(alice);
  return db.transaction((tx) =>
    createMemoryTx(
      tx,
      access,
      { title, content, category: "product", importance: "normal" },
      USER_TRACE,
      {
        visibility,
      },
    ),
  );
}
const vectorsOf = async (assetId: string) => (await vectors()).filter((r) => r.assetId === assetId);
const vectors = () =>
  db.select().from(memoryEmbeddings).where(eq(memoryEmbeddings.projectId, projectId));

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  bob = await createUser("Bob");
  slug = await project(alice, "A web shop with login and payments for my bakery.");
  projectId = (await accessOf(alice)).project.id;
  modelId = await installEmbeddingModel();
});
afterEach(removeEmbeddingModel);

describe("turning semantic search on", () => {
  it("needs consent, a model and the right to manage members, and writes an audit event", async () => {
    expect(await code(setSemanticSearch(alice, slug, { enabled: true }))).toBe(
      "VALIDATION_ERROR:required",
    );
    await removeEmbeddingModel();
    expect(
      await code(setSemanticSearch(alice, slug, { enabled: true, consent: CONSENT_VERSION })),
    ).toBe("VALIDATION_ERROR:noModel");
    modelId = await installEmbeddingModel();
    expect(
      await code(setSemanticSearch(bob, slug, { enabled: true, consent: CONSENT_VERSION })),
    ).toBe("NOT_FOUND:");
    expect(
      await code(setSemanticSearch(alice, slug, { enabled: true, consent: CONSENT_VERSION })),
    ).toBe("OK");
    const [settings] = await db
      .select()
      .from(projectSettings)
      .where(eq(projectSettings.projectId, projectId));
    expect(settings.semanticSearchEnabled).toBe(true);
    const audit = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.projectId, projectId), eq(auditEvents.type, "memory.semantic_enabled")),
      );
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toMatchObject({ consentVersion: CONSENT_VERSION });
  });
});

describe("the reconcile job", () => {
  beforeEach(async () => {
    await setSemanticSearch(alice, slug, { enabled: true, consent: CONSENT_VERSION });
  });

  it("embeds project memory, never a private one, and does nothing the second time", async () => {
    const calls: string[][] = [];
    const embedder = fakeEmbedder(modelId, { onCall: (t) => calls.push([...t]) });
    const shared = await make("Hosting", "The client covers the Vercel bill");
    const secret = await make("Private note", "price negotiation with the vendor", "private");

    await processMemoryJobs({ embedder });
    // A new project already holds journal memories; they are embedded too.
    const rows = await vectors();
    expect(await vectorsOf(shared.assetId)).toHaveLength(1);
    expect(rows.some((r) => r.assetId === secret.assetId)).toBe(false);
    expect(calls).toHaveLength(1);
    const embeddedBefore = rows.length;

    await enqueueEmbedProject(db, projectId);
    await processMemoryJobs({ embedder });
    expect(calls).toHaveLength(1); // nothing changed, nothing was sent
    expect(await vectors()).toHaveLength(embeddedBefore);
  });

  it("replaces a changed text and removes what is no longer eligible", async () => {
    const embedder = fakeEmbedder(modelId);
    const memo = await make("Hosting", "The client covers the Vercel bill");
    await processMemoryJobs({ embedder });
    const [before] = await vectorsOf(memo.assetId);

    await db
      .update(memoryAssets)
      .set({ visibility: "private" })
      .where(eq(memoryAssets.id, memo.assetId));
    await reconcileProject(projectId, { override: embedder });
    expect(await vectorsOf(memo.assetId)).toHaveLength(0);

    await db
      .update(memoryAssets)
      .set({ visibility: "project" })
      .where(eq(memoryAssets.id, memo.assetId));
    await reconcileProject(projectId, { override: embedder });
    const [after] = await vectorsOf(memo.assetId);
    expect(after.id).not.toBe(before.id); // removed while private, written anew
  });

  it("replaces the vector of a changed text and sends only that text again", async () => {
    const calls: string[][] = [];
    const embedder = fakeEmbedder(modelId, { onCall: (t) => calls.push([...t]) });
    const memo = await make("Hosting", "The client covers the Vercel bill");
    await reconcileProject(projectId, { override: embedder });
    const [before] = await vectorsOf(memo.assetId);
    const total = (await vectors()).length;
    calls.length = 0;

    await db
      .update(memories)
      .set({ content: "The agency covers the Vercel bill" })
      .where(eq(memories.assetId, memo.assetId));
    await reconcileProject(projectId, { override: embedder });
    const [after] = await vectorsOf(memo.assetId);
    expect(after.id).toBe(before.id);
    expect(after.contentHash).not.toBe(before.contentHash);
    expect(await vectors()).toHaveLength(total);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(1);
    expect(calls[0][0]).toContain("agency");
  });

  it("keeps the old rows when the provider fails, and the job ends retryable without text", async () => {
    const memo = await make("Hosting", "The client covers the Vercel bill");
    await reconcileProject(projectId, { override: fakeEmbedder(modelId) });
    const kept = await vectorsOf(memo.assetId);
    expect(kept).toHaveLength(1);
    await db
      .update(memories)
      .set({ content: "The agency covers the Vercel bill" })
      .where(eq(memories.assetId, memo.assetId));
    await db.delete(memoryJobs).where(eq(memoryJobs.projectId, projectId));
    await enqueueEmbedProject(db, projectId);
    await processMemoryJobs({ embedder: fakeEmbedder(modelId, { fail: true }) });
    const still = await vectorsOf(memo.assetId);
    expect(still.map((r) => [r.id, r.contentHash])).toEqual(kept.map((r) => [r.id, r.contentHash]));
    const [job] = await db.select().from(memoryJobs).where(eq(memoryJobs.kind, "embed_project"));
    expect(job.status).toBe("failed_retryable");
    expect(job.errorCode).toBe("job_failed");
    expect(JSON.stringify(job)).not.toContain("Vercel");
  });

  it("is queued by the outbox consumer, only for a project that opted in", async () => {
    await db.delete(memoryJobs).where(eq(memoryJobs.projectId, projectId));
    await make("Hosting", "The client covers the Vercel bill");
    const consumed = await processProjectChanges(projectId);
    expect(consumed.processed).toBeGreaterThan(0);
    const queued = await db.select().from(memoryJobs).where(eq(memoryJobs.kind, "embed_project"));
    expect(queued).toHaveLength(1);

    await setSemanticSearch(alice, slug, { enabled: false });
    expect(await vectors()).toHaveLength(0);
    await db.delete(memoryJobs).where(eq(memoryJobs.projectId, projectId));
    await enqueueEmbedProject(db, projectId);
    expect(
      await db.select().from(memoryJobs).where(eq(memoryJobs.kind, "embed_project")),
    ).toHaveLength(0);
  });
});
