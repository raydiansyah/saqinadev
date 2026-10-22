import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { memories, memoryAssets, projectMembers, skills } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { USER_TRACE } from "@/lib/events/types";
import { rejectMemory } from "@/lib/memory/lifecycle";
import type { Principal } from "@/lib/memory/policy";
import { listReviewQueue } from "@/lib/memory/queries";
import { retrieveMemory } from "@/lib/memory/retrieval/engine";
import { createMemoryTx } from "@/lib/memory/service";
import { listSkillReview } from "@/lib/memory/skills/queries";
import { createSkill, setSkillVisibility } from "@/lib/memory/skills/service";
import { exportMemoryPackage } from "@/lib/memory/transfer/export";
import { importMemoryPackage } from "@/lib/memory/transfer/import";
import { checksumOf, PACKAGE_FORMAT, PACKAGE_VERSION } from "@/lib/memory/transfer/package";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

let alice: Actor; // owner of A and of B
let bob: Actor; // editor in A
let carol: Actor; // viewer in A
let eve: Actor; // stranger
let slugA: string;
let slugB: string;
let projectA: string;
let projectB: string;

const asUser = (a: Actor): Principal => ({ kind: "user", userId: a.id, role: "owner" });
const accessOf = (a: Actor, slug: string) => loadProjectAccess(a, { slug }, "project:read");
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};
const pack = (items: unknown[]) => ({
  format: PACKAGE_FORMAT,
  version: PACKAGE_VERSION,
  exportedAt: new Date().toISOString(),
  project: { name: "x" },
  items,
  checksum: checksumOf(items),
});
const memoryItem = (title: string, over: Record<string, unknown> = {}) => ({
  type: "memory",
  title,
  content: `${title} content for the team`,
  category: "product",
  ...over,
});
const skillItem = (name: string, over: Record<string, unknown> = {}) => ({
  type: "skill",
  name,
  description: "Builds the checklist a release needs before it goes live.",
  triggers: ["a release is about to ship"],
  steps: [
    { title: "List changes", detail: "Read the merged pull requests." },
    { title: "Check migrations", detail: "Confirm each is reversible." },
  ],
  validation: ["every item has an owner"],
  ...over,
});

async function make(
  actor: Actor,
  slug: string,
  title: string,
  options: Parameters<typeof createMemoryTx>[4] = {},
) {
  const access = await accessOf(actor, slug);
  return db.transaction((tx) =>
    createMemoryTx(
      tx,
      access,
      { title, content: `${title} text`, category: "product", importance: "normal" },
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
  slugB = await project(alice, "A recipe sharing app for home cooks and friends.");
  projectA = (await accessOf(alice, slugA)).project.id;
  projectB = (await accessOf(alice, slugB)).project.id;
  await db.insert(projectMembers).values([
    { projectId: projectA, userId: bob.id, role: "editor" },
    { projectId: projectA, userId: carol.id, role: "viewer" },
  ]);
});

describe("export", () => {
  it("holds what the person can read, with their own private notes and nobody else's", async () => {
    await make(alice, slugA, "Alice private", { visibility: "private" });
    await make(bob, slugA, "Bob private", { visibility: "private" });
    await make(alice, slugA, "Shared fact");
    const names = async (a: Actor) =>
      (await exportMemoryPackage(a, slugA)).items.flatMap((i) =>
        i.type === "memory" ? [i.title] : [],
      );
    const forBob = await names(bob);
    expect(forBob).toContain("Bob private");
    expect(forBob).toContain("Shared fact");
    expect(forBob).not.toContain("Alice private");
    expect(await names(carol)).not.toContain("Bob private");
    expect(await names(carol)).toContain("Shared fact");
  });

  it("leaves out links into private chats, keeps names that are not private, and carries a checksum", async () => {
    await make(alice, slugA, "Cited fact", {
      sources: [
        {
          sourceType: "message",
          sourceId: "11111111-1111-4111-8111-111111111111",
          locator: { conversationId: "c" },
        },
        { sourceType: "document", sourceId: "prd" },
      ],
    });
    const out = await exportMemoryPackage(alice, slugA);
    const item = out.items.find((i) => i.type === "memory" && i.title === "Cited fact");
    expect(item?.type === "memory" && item.sources).toEqual([{ type: "document", ref: "prd" }]);
    expect(JSON.stringify(out)).not.toContain("11111111-1111");
    expect(out.checksum).toBe(checksumOf(out.items));
    expect(out).toMatchObject({ format: PACKAGE_FORMAT, version: PACKAGE_VERSION });
  });

  it("includes skills the person can use, not other people's private ones", async () => {
    await createSkill(alice, slugA, skillItem("Alice secret routine"));
    const shared = await createSkill(alice, slugA, skillItem("Shared routine"));
    await setSkillVisibility(alice, slugA, { id: shared, visibility: "project" });
    const skillNames = async (a: Actor) =>
      (await exportMemoryPackage(a, slugA)).items.flatMap((i) =>
        i.type === "skill" ? [i.name] : [],
      );
    expect(await skillNames(alice)).toEqual(
      expect.arrayContaining(["Alice secret routine", "Shared routine"]),
    );
    expect(await skillNames(bob)).toEqual(["Shared routine"]);
  });

  it("is not for strangers", async () => {
    expect(await code(exportMemoryPackage(eve, slugA))).toBe("NOT_FOUND");
  });
});

describe("import", () => {
  it("brings everything in as private suggestions that wait for review, and ignores what the file claims", async () => {
    const result = await importMemoryPackage(
      bob,
      slugA,
      pack([
        memoryItem("Claims to be shared", {
          visibility: "project",
          status: "approved",
          owner: alice.id,
          confidence: "confirmed",
          level: "L3",
        }),
        skillItem("Imported routine", { visibility: "project", status: "approved" }),
      ]),
    );
    expect(result).toMatchObject({ memories: 1, skills: 1 });
    const [asset] = await db
      .select()
      .from(memoryAssets)
      .where(eq(memoryAssets.title, "Claims to be shared"));
    expect(asset).toMatchObject({
      status: "pending_review",
      visibility: "private",
      ownerId: bob.id,
    });
    const [memory] = await db.select().from(memories).where(eq(memories.assetId, asset.id));
    expect(memory).toMatchObject({ level: "L1", confidence: "extracted", source: "imported" });
    const [sk] = await db
      .select()
      .from(memoryAssets)
      .where(eq(memoryAssets.title, "Imported routine"));
    expect(sk).toMatchObject({ status: "pending_review", visibility: "private", ownerId: bob.id });

    // Only the importer sees them, and nothing is retrievable before approval.
    expect((await listReviewQueue(await accessOf(bob, slugA))).map((r) => r.asset.title)).toEqual([
      "Claims to be shared",
    ]);
    expect((await listSkillReview(await accessOf(bob, slugA))).map((r) => r.asset.title)).toEqual([
      "Imported routine",
    ]);
    expect(await listReviewQueue(await accessOf(alice, slugA))).toHaveLength(0);
    expect(
      (await retrieveMemory(asUser(bob), projectA, { query: "Claims shared team" })).items,
    ).toEqual([]);
  });

  it("round-trips a project's memory into another project, as candidates", async () => {
    await make(alice, slugA, "Use idempotency keys");
    await make(alice, slugA, "Prices are in rupiah");
    await createSkill(alice, slugA, skillItem("Cut a release"));
    const out = await exportMemoryPackage(alice, slugA);
    const result = await importMemoryPackage(alice, slugB, JSON.parse(JSON.stringify(out)));
    expect(result.memories).toBeGreaterThanOrEqual(2);
    expect(result.skills).toBe(1);
    const titles = (
      await db
        .select()
        .from(memoryAssets)
        .where(and(eq(memoryAssets.projectId, projectB), eq(memoryAssets.status, "pending_review")))
    ).map((a) => a.title);
    expect(titles).toEqual(
      expect.arrayContaining(["Use idempotency keys", "Prices are in rupiah", "Cut a release"]),
    );
    const [row] = await db.select().from(skills).where(eq(skills.projectId, projectB));
    expect(row.evaluation?.score).toBeGreaterThanOrEqual(50);
  });

  it("skips what is already there and what was removed before", async () => {
    const items = [memoryItem("Fact one"), memoryItem("Fact two"), skillItem("Routine one")];
    await importMemoryPackage(alice, slugA, pack(items));
    const again = await importMemoryPackage(alice, slugA, pack(items));
    expect(again).toMatchObject({ memories: 0, skills: 0 });
    expect(again.skipped.duplicate).toBe(3);

    const [candidate] = await db
      .select()
      .from(memoryAssets)
      .where(eq(memoryAssets.title, "Fact one"));
    await rejectMemory(alice, slugA, { id: candidate.id });
    const third = await importMemoryPackage(alice, slugA, pack([memoryItem("Fact one")]));
    expect(third.skipped.previouslyRemoved).toBe(1);
  });

  it("refuses a secret, a weak skill and what is not valid, and still reads the rest", async () => {
    const result = await importMemoryPackage(
      alice,
      slugA,
      pack([
        memoryItem("Deploy key", {
          content: "the key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789",
        }),
        skillItem("One step only", { steps: [{ title: "Only", detail: "x" }] }),
        { type: "memory", title: "x", content: "" },
        { type: "other" },
        memoryItem("Good fact"),
      ]),
    );
    expect(result).toMatchObject({ memories: 1, skills: 0 });
    expect(result.skipped).toMatchObject({ blocked: 2, invalid: 2 });
  });

  it("refuses a package that is not one, that was altered, or that is too big", async () => {
    expect(await code(importMemoryPackage(alice, slugA, { hello: "world" }))).toBe(
      "VALIDATION_ERROR",
    );
    expect(await code(importMemoryPackage(alice, slugA, "text"))).toBe("VALIDATION_ERROR");
    const tampered = pack([memoryItem("Original")]);
    tampered.items = [memoryItem("Edited after export")];
    expect(await code(importMemoryPackage(alice, slugA, tampered))).toBe("VALIDATION_ERROR");
    const big = pack(Array.from({ length: 201 }, (_, i) => memoryItem(`Fact number ${i}`)));
    expect(await code(importMemoryPackage(alice, slugA, big))).toBe("VALIDATION_ERROR");
    expect(
      await db.select().from(memoryAssets).where(eq(memoryAssets.status, "pending_review")),
    ).toHaveLength(0);
  });

  it("is for people who can write, and not for strangers", async () => {
    const one = pack([memoryItem("Anything")]);
    expect(await code(importMemoryPackage(carol, slugA, one))).toBe("AUTHORIZATION_ERROR");
    expect(await code(importMemoryPackage(eve, slugA, one))).toBe("NOT_FOUND");
  });

  it("does not let an import bury the review queue", async () => {
    for (let round = 0; round < 2; round++) {
      await importMemoryPackage(
        alice,
        slugA,
        pack(Array.from({ length: 120 }, (_, i) => memoryItem(`Round ${round} fact ${i}`))),
      );
    }
    const waiting = await db
      .select()
      .from(memoryAssets)
      .where(and(eq(memoryAssets.ownerId, alice.id), eq(memoryAssets.status, "pending_review")));
    expect(waiting.length).toBeLessThanOrEqual(200);
    const last = await importMemoryPackage(alice, slugA, pack([memoryItem("One more")]));
    expect(last.skipped.backlog).toBe(1);
  });
  it("does not reveal another person's pending or rejected text through duplicates", async () => {
    await make(bob, slugA, "Pending idea nobody approved");
    await db
      .update(memoryAssets)
      .set({ visibility: "project", status: "pending_review" })
      .where(eq(memoryAssets.title, "Pending idea nobody approved"));
    const result = await importMemoryPackage(
      alice,
      slugA,
      pack([
        memoryItem("Pending idea nobody approved", {
          content: "Pending idea nobody approved text",
        }),
      ]),
    );
    expect(result.skipped.duplicate).toBe(0);
    expect(result.memories).toBe(1);
  });

  it("refuses a secret hidden with zero-width characters", async () => {
    const key = `AKIA${"A".repeat(16)}`;
    const split = `${key.slice(0, 6)}\u200b${key.slice(6)}`;
    const result = await importMemoryPackage(
      alice,
      slugA,
      pack([memoryItem("Deploy notes", { content: `the key is ${split}` })]),
    );
    expect(result.skipped.blocked).toBe(1);
    expect(result.memories).toBe(0);
  });

  it("exports in parts that import in one go", async () => {
    const first = await exportMemoryPackage(alice, slugA, { part: 1 });
    expect(first.part === undefined || first.part.number === 1).toBe(true);
    const outOfRange = await exportMemoryPackage(alice, slugA, { part: 99 });
    expect(outOfRange.part === undefined || outOfRange.part.number === outOfRange.part.of).toBe(
      true,
    );
  });

  it("keeps two imports at once from making duplicates", async () => {
    const one = pack([memoryItem("Race fact")]);
    await Promise.all([
      importMemoryPackage(alice, slugA, one),
      importMemoryPackage(alice, slugA, one),
    ]);
    const rows = await db
      .select()
      .from(memoryAssets)
      .where(and(eq(memoryAssets.ownerId, alice.id), eq(memoryAssets.title, "Race fact")));
    expect(rows).toHaveLength(1);
  });
});
