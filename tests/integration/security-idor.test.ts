import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  decisions,
  documents,
  memories,
  projectMembers,
  requirements,
  tasks,
} from "@/lib/db/schema";
import { createDecision, setDecisionStatus } from "@/lib/decisions/service";
import { saveDocument } from "@/lib/documents/service";
import { AppError } from "@/lib/errors";
import { createMemory, updateMemory } from "@/lib/memory/service";
import {
  createRequirement,
  deleteRequirement,
  updateRequirement,
} from "@/lib/requirements/service";
import { search } from "@/lib/search/service";
import { createTask, updateTask } from "@/lib/tasks/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

/**
 * Insecure direct object reference matrix: an id from project A, used through project B's slug or by
 * someone who is not a member, must never read or change anything. The first request in each pair
 * changes the id (the /order/123 to /order/124 move); the second changes the person.
 */

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

let alice: Actor; // owns project A
let bob: Actor; // owns project B
let viewer: Actor; // read-only member of A
let signedOut: Actor; // an actor that exists but is a member of nothing
let slugA: string;
let slugB: string;
let idsA: { task: string; requirement: string; memory: string; decision: string; doc: string };

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  bob = await createUser("Bob");
  viewer = await createUser("Viewer");
  signedOut = await createUser("Nobody");
  slugA = await project(alice, "A web shop with login and payments for my bakery.");
  slugB = await project(bob, "A recipe sharing app for home cooks and friends.");
  const a = await loadProjectAccess(alice, { slug: slugA }, "project:read");
  await db
    .insert(projectMembers)
    .values({ projectId: a.project.id, userId: viewer.id, role: "viewer" });

  const task = await createTask(alice, slugA, { title: "Secret task of A" });
  const requirement = await createRequirement(alice, slugA, {
    group: "features",
    title: "Secret requirement of A",
    description: "",
    priority: "medium",
    status: "confirmed",
  });
  await createMemory(alice, slugA, {
    title: "Secret memory of A",
    content: "private",
    category: "product",
    importance: "normal",
  });
  await createDecision(alice, slugA, {
    question: "Secret decision of A?",
    context: "",
    options: ["x", "y"],
    selected: "x",
    reason: "because",
  });
  const [req] = await db
    .select()
    .from(requirements)
    .where(eq(requirements.projectId, a.project.id));
  const [mem] = await db.select().from(memories).where(eq(memories.projectId, a.project.id));
  const [dec] = await db.select().from(decisions).where(eq(decisions.projectId, a.project.id));
  const [doc] = await db.select().from(documents).where(eq(documents.projectId, a.project.id));
  idsA = {
    task: task.id,
    requirement: requirement?.id ?? req.id,
    memory: mem.id,
    decision: dec.id,
    doc: doc?.slug ?? "prd",
  };
});

const FULL_REQ = {
  group: "features",
  title: "Hijacked",
  description: "",
  priority: "medium",
  status: "confirmed",
} as const;

const snapshot = async () => ({
  tasks: await db.select().from(tasks),
  requirements: await db.select().from(requirements),
  memories: await db.select().from(memories),
  decisions: await db.select().from(decisions),
});

describe("an id from another project", () => {
  it("cannot be changed through the owner's own project slug", async () => {
    const before = await snapshot();
    expect(await code(updateTask(bob, slugB, { id: idsA.task, title: "Hijacked" }))).toBe(
      "NOT_FOUND",
    );
    expect(await code(updateRequirement(bob, slugB, { ...FULL_REQ, id: idsA.requirement }))).toBe(
      "NOT_FOUND",
    );
    expect(await code(deleteRequirement(bob, slugB, { id: idsA.requirement }))).toBe("NOT_FOUND");
    expect(
      await code(
        updateMemory(bob, slugB, {
          id: idsA.memory,
          title: "Hijacked",
          content: "x",
          category: "product",
          importance: "normal",
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await code(setDecisionStatus(bob, slugB, { id: idsA.decision, status: "superseded" })),
    ).toBe("NOT_FOUND");
    expect(await snapshot()).toEqual(before);
  });
});

describe("a person who is not allowed", () => {
  it("a stranger learns nothing, even about the slug", async () => {
    const before = await snapshot();
    expect(await code(updateTask(signedOut, slugA, { id: idsA.task, title: "xx" }))).toBe(
      "NOT_FOUND",
    );
    expect(await code(createTask(signedOut, slugA, { title: "injected" }))).toBe("NOT_FOUND");
    expect(
      await code(updateRequirement(signedOut, slugA, { ...FULL_REQ, id: idsA.requirement })),
    ).toBe("NOT_FOUND");
    expect(
      await code(
        saveDocument(signedOut, slugA, { docSlug: idsA.doc, content: "x", baseVersion: 1 }),
      ),
    ).toBe("NOT_FOUND");
    expect(await snapshot()).toEqual(before);
  });

  it("a read-only member is refused, not told the project does not exist", async () => {
    const before = await snapshot();
    expect(await code(updateTask(viewer, slugA, { id: idsA.task, title: "xx" }))).toBe(
      "AUTHORIZATION_ERROR",
    );
    expect(
      await code(
        createRequirement(viewer, slugA, {
          group: "features",
          title: "xx",
          description: "",
          priority: "low",
          status: "inferred",
        }),
      ),
    ).toBe("AUTHORIZATION_ERROR");
    expect(
      await code(saveDocument(viewer, slugA, { docSlug: idsA.doc, content: "x", baseVersion: 1 })),
    ).toBe("AUTHORIZATION_ERROR");
    expect(await snapshot()).toEqual(before);
  });

  it("search only ever returns the searcher's own projects", async () => {
    // Bob's own documents may match the word; nothing of Alice's project may.
    expect((await search(bob, "Secret")).filter((h) => h.projectSlug === slugA)).toEqual([]);
    expect((await search(signedOut, "Secret")).length).toBe(0);
    expect((await search(alice, "Secret")).length).toBeGreaterThan(0);
  });
});

describe("hostile text", () => {
  const PAYLOADS = [
    "'; DROP TABLE tasks; --",
    '" OR "1"="1',
    "1; SELECT pg_sleep(5)",
    "%' OR title LIKE '%",
    "\\' OR 1=1 --",
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "${7*7}{{7*7}}",
    "\u0000\u0007control",
  ];

  it("is stored and searched as plain data, and nothing else changes", async () => {
    for (const payload of PAYLOADS) {
      const t = await createTask(alice, slugA, {
        title: `T ${payload}`.slice(0, 190),
        description: payload,
      });
      // NUL cannot be stored; everything else is kept exactly.
      expect(t.description).toBe(payload.replaceAll("\u0000", "").trim());
      // Searching for it must neither error nor widen the result to other people's data.
      await expect(search(alice, payload)).resolves.toBeInstanceOf(Array);
      expect((await search(bob, payload)).every((h) => !h.title.includes("of A"))).toBe(true);
    }
    // The tables are all still there and the secret rows are untouched.
    const rows = await db.select().from(tasks);
    expect(rows.some((r) => r.title === "Secret task of A")).toBe(true);
  });

  it("a LIKE wildcard in a search matches literally, not everything", async () => {
    expect(await search(bob, "%%")).toEqual([]);
    expect(await search(bob, "__")).toEqual([]);
  });
});

describe("NUL characters", () => {
  it("are dropped instead of crashing the request", async () => {
    const t = await createTask(alice, slugA, { title: "Nul\u0000 title", description: "a\u0000b" });
    expect(t.title).toBe("Nul title");
    expect(t.description).toBe("ab");
  });
});
