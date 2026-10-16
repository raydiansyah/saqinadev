import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { docIndex, memories } from "@/lib/db/schema";
import { indexDocs, listDocMap } from "@/lib/docmap/index-docs";
import { updateMemory } from "@/lib/memory/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

let alice: Actor;
let slug: string;
let projectId: string;

const run = (docs: { path: string; content: string }[], ai = {}) =>
  db.transaction((tx) => indexDocs(tx, projectId, docs, ai));
const map = () => db.transaction((tx) => listDocMap(tx, projectId));
const fileMemory = (path: string) =>
  db
    .select()
    .from(memories)
    .where(and(eq(memories.projectId, projectId), eq(memories.dedupeKey, `file:${path}`)));

// Two repositories that organise the same things differently.
const layoutA = [
  { path: "PRD.md", content: "# PRD\n\n## Goals\nSell cakes.\n" },
  { path: "docs/memory/auth.md", content: "# Auth choice\n\nWe use passkeys first.\n" },
  { path: "docs/sdlc/release.md", content: "# Release\n\nTag, then deploy." },
];
const layoutB = [
  { path: "documentation/product/requirements.md", content: "# Requirements\n\n## Goals\nx\n" },
  { path: "documentation/adr/0001-db.md", content: "# Use Postgres\n\nStatus: accepted" },
  { path: "documentation/clients/acme.md", content: "# Acme call\n\nThey want invoices." },
];

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  slug = await project(alice, "A web shop with login and payments for my bakery.");
  projectId = (await loadProjectAccess(alice, { slug }, "project:read")).project.id;
});

describe("document map", () => {
  it("maps two differently organised repositories without a fixed layout", async () => {
    await run(layoutA);
    expect(Object.fromEntries((await map()).map((r) => [r.path, r.role]))).toEqual({
      "PRD.md": "prd",
      "docs/memory/auth.md": "memory",
      "docs/sdlc/release.md": "process",
    });
    await resetDatabase();
    alice = await createUser("Alice");
    slug = await project(alice, "A web shop with login and payments for my bakery.");
    projectId = (await loadProjectAccess(alice, { slug }, "project:read")).project.id;
    await run(layoutB);
    expect(Object.fromEntries((await map()).map((r) => [r.path, r.role]))).toEqual({
      "documentation/product/requirements.md": "prd",
      "documentation/adr/0001-db.md": "decision",
      "documentation/clients/acme.md": "client",
    });
  });

  it("only processes paths whose content changed", async () => {
    expect(await run(layoutA)).toMatchObject({ added: 3, changed: 0, unchanged: 0 });
    expect(await run(layoutA)).toMatchObject({ added: 0, changed: 0, unchanged: 3 });
    // Line endings and trailing spaces are not a change.
    expect(
      await run(layoutA.map((d) => ({ ...d, content: `${d.content.replace(/\n/g, "  \r\n")}\n` }))),
    ).toMatchObject({ unchanged: 3, changed: 0 });
    const changed = layoutA.map((d) =>
      d.path === "PRD.md" ? { ...d, content: `${d.content}\n## Risks\nNone.\n` } : d,
    );
    expect(await run(changed)).toMatchObject({ added: 0, changed: 1, unchanged: 2 });
  });

  it("turns memory files into memories, once, and never over a person's edit", async () => {
    expect((await run(layoutA)).memories).toBe(1);
    const [m] = await fileMemory("docs/memory/auth.md");
    expect(m).toMatchObject({ source: "imported", title: "Auth choice", entityType: "file" });
    expect(m.content).toContain("passkeys");

    expect((await run(layoutA)).memories).toBe(0);
    expect(await fileMemory("docs/memory/auth.md")).toHaveLength(1);

    await updateMemory(alice, slug, {
      id: m.id,
      title: m.title,
      content: "Rewritten by a person.",
      category: "product",
      importance: "normal",
    });
    await run(
      layoutA.map((d) =>
        d.path.includes("memory") ? { ...d, content: "# Auth choice\n\nNow magic links." } : d,
      ),
    );
    const [after] = await fileMemory("docs/memory/auth.md");
    expect(after.content).toBe("Rewritten by a person.");
  });

  it("keeps a role a person chose, and drops paths that are gone", async () => {
    await run(layoutA);
    await db
      .update(docIndex)
      .set({ role: "spec", classifiedBy: "user" })
      .where(and(eq(docIndex.projectId, projectId), eq(docIndex.path, "docs/sdlc/release.md")));
    await run([{ path: "docs/sdlc/release.md", content: "# Release v2\n\nChanged." }, layoutA[0]]);
    const rows = await map();
    expect(rows.find((r) => r.path === "docs/sdlc/release.md")).toMatchObject({
      role: "spec",
      classifiedBy: "user",
    });
    expect(rows.map((r) => r.path)).not.toContain("docs/memory/auth.md");
  });

  it("uses a model's hint where the rules only had a content guess, never over a firm name", async () => {
    const odd = [{ path: "notes/what-we-build.md", content: "# Notes\n\nSome prose." }];
    await run(odd, { prd: "notes/what-we-build.md" });
    expect((await map())[0]).toMatchObject({ role: "prd", classifiedBy: "ai" });
    // A hint does not overrule a firm name:
    await run([{ path: "PRD.md", content: "# x" }], { plan: "PRD.md" });
    expect((await map()).find((r) => r.path === "PRD.md")?.role).toBe("prd");
  });
});
