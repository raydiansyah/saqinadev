import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { processProjectChanges } from "@/lib/brain/process";
import { db } from "@/lib/db/client";
import { memories, projectChanges } from "@/lib/db/schema";
import { createDecision, setDecisionStatus } from "@/lib/decisions/service";
import { saveDocument } from "@/lib/documents/service";
import { createMemory, updateMemory } from "@/lib/memory/service";
import { updateTechStack } from "@/lib/projects/stack";
import { createTask } from "@/lib/tasks/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

let alice: Actor;
let slug: string;
let projectId: string;

const journal = () =>
  db
    .select()
    .from(memories)
    .where(and(eq(memories.projectId, projectId), isNotNull(memories.dedupeKey)));
const pending = async () =>
  (
    await db
      .select()
      .from(projectChanges)
      .where(and(eq(projectChanges.projectId, projectId), isNull(projectChanges.processedAt)))
  ).length;

/** Drain until nothing is pending: the journal's own memory changes are changes too. */
async function drain() {
  for (let i = 0; i < 5 && (await pending()) > 0; i++) await processProjectChanges(projectId);
}

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  slug = await project(alice, "A web shop with login and payments for my bakery.");
  projectId = (await loadProjectAccess(alice, { slug }, "project:read")).project.id;
  await drain();
});

const decide = () =>
  createDecision(alice, slug, {
    question: "Which database?",
    context: "",
    options: ["postgres", "mysql"],
    selected: "postgres",
    reason: "Relational data and transactions.",
  });

describe("memory journal", () => {
  it("writes a decision as one concise system memory and drains the outbox", async () => {
    await decide();
    await drain();
    const [m] = (await journal()).filter((j) => j.dedupeKey?.startsWith("decision:"));
    expect(m).toMatchObject({ source: "system", category: "decision", entityType: "decision" });
    expect(m.content).toContain("postgres");
    expect(await pending()).toBe(0);
  });

  it("updates the same memory when the decision changes instead of adding another", async () => {
    const d = await decide();
    await drain();
    await setDecisionStatus(alice, slug, { id: d.id, status: "superseded" });
    await drain();
    const rows = (await journal()).filter((j) => j.dedupeKey === `decision:${d.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toContain("superseded");
  });

  it("never overwrites text a person edited", async () => {
    const d = await decide();
    await drain();
    const [m] = (await journal()).filter((j) => j.dedupeKey === `decision:${d.id}`);
    await updateMemory(alice, slug, {
      id: m.id,
      title: m.title,
      content: "Our own wording of this decision.",
      category: "decision",
      importance: "high",
    });
    await setDecisionStatus(alice, slug, { id: d.id, status: "superseded" });
    await drain();
    const [after] = (await journal()).filter((j) => j.dedupeKey === `decision:${d.id}`);
    expect(after.content).toBe("Our own wording of this decision.");
  });

  it("keeps one memory per document however often it is edited", async () => {
    const doc = await db.query.documents.findFirst({
      where: (t, { and, eq }) => and(eq(t.projectId, projectId), eq(t.slug, "prd")),
    });
    if (!doc) throw new Error("no prd");
    let version = doc.version;
    for (const text of ["# PRD\n\nOne", "# PRD\n\nTwo", "# PRD\n\nThree"]) {
      const saved = await saveDocument(alice, slug, {
        docSlug: "prd",
        content: text,
        baseVersion: version,
      });
      version = saved.version;
    }
    await drain();
    const rows = (await journal()).filter((j) => j.dedupeKey === "doc:prd");
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toContain(`version ${version}`);
  });

  it("records stack changes and ignores routine ones", async () => {
    const before = (await db.select().from(memories).where(eq(memories.projectId, projectId)))
      .length;
    await createTask(alice, slug, { title: "Routine task" });
    await createMemory(alice, slug, {
      title: "Human note",
      content: "x",
      category: "product",
      importance: "normal",
    });
    await drain();
    const after = await db.select().from(memories).where(eq(memories.projectId, projectId));
    expect(after.length).toBe(before + 1); // only the human note
    await updateTechStack(alice, slug, { key: "database", value: "postgres" });
    await drain();
    expect((await journal()).some((j) => j.dedupeKey === "stack:database")).toBe(true);
  });

  it("two workers at once journal each change exactly once", async () => {
    await decide();
    await Promise.all([processProjectChanges(projectId), processProjectChanges(projectId)]);
    await drain();
    const rows = (await journal()).filter((j) => j.dedupeKey?.startsWith("decision:"));
    expect(rows).toHaveLength(1);
  });

  it("writes nothing and moves no revision when the text did not change", async () => {
    const d = await decide();
    await drain();
    const [p1] = await db.query.projects.findMany({ where: (t, { eq }) => eq(t.id, projectId) });
    await setDecisionStatus(alice, slug, { id: d.id, status: "accepted" });
    const [{ contextRevision: afterAction }] = await db.query.projects.findMany({
      where: (t, { eq }) => eq(t.id, projectId),
    });
    await drain();
    const [p2] = await db.query.projects.findMany({ where: (t, { eq }) => eq(t.id, projectId) });
    expect(afterAction).toBeGreaterThan(p1.contextRevision);
    expect(p2.contextRevision).toBe(afterAction);
  });
});
