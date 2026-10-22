import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { processProjectChanges } from "@/lib/brain/process";
import { db } from "@/lib/db/client";
import {
  documents,
  memoryAssets,
  memoryJobs,
  projectMembers,
  wikiChunks,
  wikiLinks,
  wikiSources,
} from "@/lib/db/schema";
import { indexDocs } from "@/lib/docmap/index-docs";
import { saveDocument } from "@/lib/documents/service";
import { AppError } from "@/lib/errors";
import { processMemoryJobs } from "@/lib/memory/jobs";
import type { Principal } from "@/lib/memory/policy";
import { syncWikiFromDocuments } from "@/lib/memory/wiki";
import { getWikiPage, listWikiSources } from "@/lib/memory/wiki/queries";
import { retrieveWiki } from "@/lib/memory/wiki/retrieve";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

let alice: Actor;
let carol: Actor; // viewer in A
let eve: Actor; // owner of B
let slugA: string;
let slugB: string;
let projectA: string;

const asUser = (a: Actor, role: "owner" | "viewer" = "owner"): Principal => ({
  kind: "user",
  userId: a.id,
  role,
});
const agent = (canReadMemory = true): Principal => ({
  kind: "agent",
  agentId: "00000000-0000-4000-8000-000000000001",
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

const GUIDE = `# Billing guide

How invoices work.

## Refunds

Refunds return to the original method within 7 days.
Invoice INV-2024-0042 was refunded in full.

## Taxes

Tax is added at checkout. See [[Payments]] and [setup](setup.md).
`;

async function addDoc(
  slug: string,
  content: string,
  title = slug,
  type: "custom" | "proposal" = "custom",
) {
  const [d] = await db
    .insert(documents)
    .values({ projectId: projectA, type, title, slug, content })
    .returning();
  return d;
}
const edit = (slug: string, content: string) =>
  db
    .update(documents)
    .set({ content, version: sql`${documents.version} + 1` })
    .where(and(eq(documents.projectId, projectA), eq(documents.slug, slug)));
const sources = () => db.select().from(wikiSources).where(eq(wikiSources.projectId, projectA));
const find = async (query: string, p: Principal = asUser(alice)) =>
  retrieveWiki(p, projectA, { query });

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  carol = await createUser("Carol");
  eve = await createUser("Eve");
  slugA = await project(alice, "A web shop with login and payments for my bakery.");
  slugB = await project(eve, "A recipe sharing app for home cooks and friends.");
  projectA = (await accessOf(alice)).project.id;
  await db.insert(projectMembers).values({ projectId: projectA, userId: carol.id, role: "viewer" });
});

describe("reading documents into the wiki", () => {
  it("reads each project document once and does nothing on a repeat", async () => {
    await addDoc("billing-guide", GUIDE, "Billing guide");
    const first = await syncWikiFromDocuments(projectA);
    expect(first.created).toBeGreaterThan(0);
    const before = await sources();
    const chunksBefore = await db.select().from(wikiChunks);

    const again = await syncWikiFromDocuments(projectA);
    expect(again).toMatchObject({ created: 0, updated: 0, failed: 0, removed: 0 });
    expect(again.kept).toBe(before.length);
    expect(await sources()).toHaveLength(before.length);
    expect(await db.select().from(wikiChunks)).toHaveLength(chunksBefore.length);
    // One registry row per source, typed "wiki", shared with the project.
    const assets = await db.select().from(memoryAssets).where(eq(memoryAssets.assetType, "wiki"));
    expect(assets).toHaveLength(before.length);
    expect(assets.every((a) => a.visibility === "project" && a.status === "approved")).toBe(true);
  });

  it("never reads business documents", async () => {
    await addDoc(
      "proposal",
      "# Proposal\n\nPrice is IDR 99,000,000 and terms apply.",
      "Proposal",
      "proposal",
    );
    await syncWikiFromDocuments(projectA);
    expect((await sources()).map((s) => s.sourceRef)).not.toContain("proposal");
    expect((await find("99,000,000")).passages).toEqual([]);
  });

  it("reads again only what changed, and forgets the old text", async () => {
    await addDoc("billing-guide", GUIDE, "Billing guide");
    await syncWikiFromDocuments(projectA);
    await edit("billing-guide", GUIDE.replace("original method", "bank transfer"));
    const run = await syncWikiFromDocuments(projectA);
    expect(run.updated).toBe(1);
    expect((await find("bank transfer")).passages).toHaveLength(1);
    expect((await find("original")).passages).toEqual([]);
    const [asset] = await db
      .select()
      .from(memoryAssets)
      .where(
        eq(
          memoryAssets.id,
          (await sources()).find((s) => s.sourceRef === "billing-guide")?.assetId as string,
        ),
      );
    expect(asset.version).toBe(2);
  });

  it("removes a page, its passages and its links when the document goes away", async () => {
    await addDoc("billing-guide", GUIDE, "Billing guide");
    await syncWikiFromDocuments(projectA);
    await db
      .delete(documents)
      .where(and(eq(documents.projectId, projectA), eq(documents.slug, "billing-guide")));
    const run = await syncWikiFromDocuments(projectA);
    expect(run.removed).toBe(1);
    expect((await sources()).map((s) => s.sourceRef)).not.toContain("billing-guide");
    expect((await find("Refunds")).passages).toEqual([]);
    expect(await db.select().from(wikiLinks)).toHaveLength(0);
  });
});

describe("passages and citations", () => {
  beforeEach(async () => {
    await addDoc("billing-guide", GUIDE, "Billing guide");
    await syncWikiFromDocuments(projectA);
  });

  it("returns the passage with its source, heading path and lines", async () => {
    const r = await find("refunds original method");
    expect(r.semantic).toBe("off");
    expect(r.passages[0]).toMatchObject({
      sourceType: "document",
      sourceRef: "billing-guide",
      heading: "Billing guide › Refunds",
      title: "Billing guide",
      stale: false,
    });
    expect(r.passages[0].startLine).toBeGreaterThan(0);
    expect(r.passages[0].endLine).toBeGreaterThanOrEqual(r.passages[0].startLine);
    expect(r.passages[0].content).toContain("original method");
  });

  it("finds exact identifiers", async () => {
    expect((await find("INV-2024-0042")).passages[0].content).toContain("INV-2024-0042");
  });

  it("says nothing matches instead of guessing, and reports an unreadable index", async () => {
    expect((await find("quantum entanglement")).passages).toEqual([]);
    expect(await retrieveWiki(asUser(alice), "not-a-uuid", { query: "refunds" })).toEqual({
      passages: [],
      semantic: "off",
      degraded: "unavailable",
    });
  });

  it("respects the budget", async () => {
    const r = await retrieveWiki(asUser(alice), projectA, {
      query: "invoice refunds tax billing",
      budget: { maxAssets: 1, perAssetChars: 80 },
    });
    expect(r.passages).toHaveLength(1);
    expect(r.passages[0].content.length).toBeLessThanOrEqual(80);
  });

  it("flags a passage whose document changed after it was read", async () => {
    await edit("billing-guide", GUIDE.replace("7 days", "30 days"));
    expect((await find("refunds original method")).passages[0].stale).toBe(true);
    expect(
      (await listWikiSources(await accessOf(alice))).find((s) => s.sourceRef === "billing-guide")
        ?.stale,
    ).toBe(true);
    await syncWikiFromDocuments(projectA);
    expect((await find("refunds")).passages[0].stale).toBe(false);
  });

  it("links pages to each other, whichever is read first", async () => {
    await addDoc("payments", "# Payments\n\nCards and wallets.\n", "Payments");
    await syncWikiFromDocuments(projectA);
    const guide = (await sources()).find((s) => s.sourceRef === "billing-guide");
    const payments = (await sources()).find((s) => s.sourceRef === "payments");
    const page = await getWikiPage(await accessOf(alice), guide?.id as string);
    expect(page.links.find((l) => l.targetRef === "payments")?.targetId).toBe(payments?.id);
    const back = await getWikiPage(await accessOf(alice), payments?.id as string);
    expect(back.backlinks.map((b) => b.id)).toEqual([guide?.id]);
  });
});

describe("who can read the wiki", () => {
  beforeEach(async () => {
    await addDoc("billing-guide", GUIDE, "Billing guide");
    await syncWikiFromDocuments(projectA);
  });

  it("shows pages to members and to agents allowed to read, and to nobody else", async () => {
    expect((await find("refunds", asUser(carol, "viewer"))).passages).toHaveLength(1);
    expect((await find("refunds", agent())).passages).toHaveLength(1);
    expect((await find("refunds", agent(false))).passages).toEqual([]);
    const guide = (await sources()).find((s) => s.sourceRef === "billing-guide");
    expect(await code(getWikiPage(await accessOf(eve, slugB), guide?.id as string))).toBe(
      "NOT_FOUND",
    );
    expect(
      (await listWikiSources(await accessOf(eve, slugB))).map((s) => s.sourceRef),
    ).not.toContain("billing-guide");
  });
});

describe("keeping the wiki current", () => {
  it("queues a read when a document changes and reads it when the job runs", async () => {
    await processProjectChanges(projectA);
    const slugDoc = "prd";
    const [prd] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.projectId, projectA), eq(documents.slug, slugDoc)));
    await saveDocument(alice, slugA, {
      docSlug: slugDoc,
      content: `${prd.content}\n\n## Wombat policy\n\nWombats are handled nightly.\n`,
      baseVersion: prd.version,
    });
    for (let i = 0; i < 3; i++) await processProjectChanges(projectA);
    expect(
      (await db.select().from(memoryJobs).where(eq(memoryJobs.kind, "index_wiki"))).length,
    ).toBeGreaterThan(0);

    await processMemoryJobs();
    expect((await find("wombats nightly")).passages[0]).toMatchObject({ sourceRef: "prd" });
  });

  it("reads repository documents when they are imported, and drops them when they leave", async () => {
    const run = (docs: { path: string; content: string }[]) =>
      db.transaction((tx) => indexDocs(tx, projectA, docs));
    await run([
      { path: "docs/guide.md", content: "# Guide\n\nThe kraken protocol is documented here.\n" },
    ]);
    const hit = (await find("kraken protocol")).passages[0];
    expect(hit).toMatchObject({
      sourceType: "repo_file",
      sourceRef: "docs/guide.md",
      stale: false,
    });

    await run([
      { path: "docs/guide.md", content: "# Guide\n\nThe leviathan protocol replaced it.\n" },
    ]);
    expect((await find("kraken")).passages).toEqual([]);
    expect((await find("leviathan")).passages).toHaveLength(1);

    await run([]);
    expect((await find("leviathan")).passages).toEqual([]);
  });
});

describe("review hardening", () => {
  it("does not hand out a secret pasted into a document", async () => {
    await addDoc(
      "setup-notes",
      "# Setup\n\nThe deploy key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 for the build.\n",
      "Setup notes",
    );
    await syncWikiFromDocuments(projectA);
    const hit = (await find("deploy key build")).passages[0];
    expect(hit.content).toContain("[redacted]");
    expect(hit.content).not.toContain("sk-ant");
    const chunks = await db.select().from(wikiChunks);
    expect(chunks.map((c) => c.content).join("\n")).not.toContain("sk-ant");
  });

  it("stops returning a document the moment it is deleted, before any job runs", async () => {
    await addDoc("billing-guide", GUIDE, "Billing guide");
    await syncWikiFromDocuments(projectA);
    await db
      .delete(documents)
      .where(and(eq(documents.projectId, projectA), eq(documents.slug, "billing-guide")));
    expect((await find("refunds")).passages).toEqual([]);
    expect((await listWikiSources(await accessOf(alice))).map((s) => s.sourceRef)).not.toContain(
      "billing-guide",
    );
    const gone = (await sources()).find((s) => s.sourceRef === "billing-guide");
    expect(await code(getWikiPage(await accessOf(alice), gone?.id as string))).toBe("NOT_FOUND");
  });

  it("does not let a document the wiki cannot read fail the import", async () => {
    const run = (docs: { path: string; content: string }[]) =>
      db.transaction((tx) => indexDocs(tx, projectA, docs));
    // A NUL byte cannot be stored in text: that one file is skipped, the rest is read.
    await run([
      { path: "docs/bad.md", content: "# Bad\n\nbroken \u0000 text\n" },
      { path: "docs/good.md", content: "# Good\n\nThe okapi routine is described here.\n" },
    ]);
    expect((await find("okapi routine")).passages[0]).toMatchObject({ sourceRef: "docs/good.md" });
  });

  it("reads a repository file that was known before the wiki existed", async () => {
    const run = () =>
      db.transaction((tx) =>
        indexDocs(tx, projectA, [
          { path: "docs/old.md", content: "# Old\n\nThe axolotl notes live here.\n" },
        ]),
      );
    await run();
    await db.delete(wikiSources).where(eq(wikiSources.sourceRef, "docs/old.md"));
    expect((await find("axolotl")).passages).toEqual([]);
    await run(); // same hash: the map says unchanged, the wiki still reads it
    expect((await find("axolotl")).passages).toHaveLength(1);
  });

  it("shows the same text once when two sources carry it", async () => {
    await addDoc("billing-guide", GUIDE, "Billing guide");
    await addDoc("billing-copy", GUIDE, "Billing copy");
    await syncWikiFromDocuments(projectA);
    const hits = (await find("refunds original method")).passages.filter((p) =>
      p.content.includes("original method"),
    );
    expect(hits).toHaveLength(1);
  });

  it("says when a passage comes from a document still in draft", async () => {
    const doc = await addDoc(
      "draft-guide",
      "# Draft\n\nThe quokka policy is not final.\n",
      "Draft guide",
    );
    await syncWikiFromDocuments(projectA);
    expect((await find("quokka policy")).passages[0].draft).toBe(true);
    await db.update(documents).set({ status: "approved" }).where(eq(documents.id, doc.id));
    expect((await find("quokka policy")).passages[0].draft).toBe(false);
  });
});
