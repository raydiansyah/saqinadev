import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { dismissPrdFindings, listPrdFindings, proposePrdUpdate } from "@/lib/brain/prd-findings";
import { processProjectChanges } from "@/lib/brain/process";
import { db } from "@/lib/db/client";
import { prdFindings, projectChanges, projectMembers, proposals } from "@/lib/db/schema";
import { saveDocument } from "@/lib/documents/service";
import { AppError } from "@/lib/errors";
import { createRequirement } from "@/lib/requirements/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

let alice: Actor;
let stranger: Actor;
let viewer: Actor;
let slug: string;
let projectId: string;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

async function drain() {
  for (let i = 0; i < 5; i++) {
    const open = await db
      .select({ id: projectChanges.id })
      .from(projectChanges)
      .where(and(eq(projectChanges.projectId, projectId), isNull(projectChanges.processedAt)));
    if (open.length === 0) return;
    await processProjectChanges(projectId);
  }
}

const open = async () => listPrdFindings(await loadProjectAccess(alice, { slug }, "project:read"));
const addRequirement = (title: string) =>
  createRequirement(alice, slug, {
    group: "features",
    title,
    description: `${title} lets customers earn rewards.`,
    priority: "medium",
    status: "confirmed",
  });

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  stranger = await createUser("Stranger");
  viewer = await createUser("Viewer");
  slug = await project(alice, "A web shop with login and payments for my bakery.");
  const access = await loadProjectAccess(alice, { slug }, "project:read");
  projectId = access.project.id;
  await db.insert(projectMembers).values({ projectId, userId: viewer.id, role: "viewer" });
  await drain();
});

describe("PRD findings", () => {
  it("opens a finding for a confirmed requirement the PRD lacks, and closes it when the PRD says it", async () => {
    await addRequirement("Loyalty points");
    await drain();
    const found = (await open()).filter((f) => f.kind === "requirement_not_in_prd");
    const mine = found.find((f) => f.subject === "Loyalty points");
    expect(mine).toBeDefined();

    const prd = await db.query.documents.findFirst({
      where: (t, { and, eq }) => and(eq(t.projectId, projectId), eq(t.slug, "prd")),
    });
    await saveDocument(alice, slug, {
      docSlug: "prd",
      content: `${prd?.content}\n\n## Loyalty points\nEarn points per order.\n`,
      baseVersion: prd?.version ?? 1,
    });
    await drain();
    expect((await open()).map((f) => f.subject)).not.toContain("Loyalty points");
    const [row] = await db
      .select()
      .from(prdFindings)
      .where(eq(prdFindings.fingerprint, mine?.fingerprint ?? ""));
    expect(row.status).toBe("resolved");
  });

  it("keeps one row per disagreement however many times the check runs", async () => {
    await addRequirement("Loyalty points");
    await drain();
    await addRequirement("Gift cards");
    await drain();
    const rows = await db.select().from(prdFindings).where(eq(prdFindings.projectId, projectId));
    expect(new Set(rows.map((r) => r.fingerprint)).size).toBe(rows.length);
  });

  it("a dismissed finding stays dismissed while the disagreement lasts", async () => {
    await addRequirement("Loyalty points");
    await drain();
    const [f] = (await open()).filter((x) => x.subject === "Loyalty points");
    await dismissPrdFindings(alice, slug, { ids: [f.id] });
    await addRequirement("Gift cards"); // triggers another check
    await drain();
    expect((await open()).map((x) => x.subject)).not.toContain("Loyalty points");
    const [row] = await db.select().from(prdFindings).where(eq(prdFindings.id, f.id));
    expect(row.status).toBe("dismissed");
  });

  it("proposes a PRD update as one reviewable proposal and applies nothing itself", async () => {
    await addRequirement("Loyalty points");
    await drain();
    const [f] = (await open()).filter((x) => x.subject === "Loyalty points");
    const before = await db.query.documents.findFirst({
      where: (t, { and, eq }) => and(eq(t.projectId, projectId), eq(t.slug, "prd")),
    });
    const { proposalId } = await proposePrdUpdate(alice, slug, { ids: [f.id] });
    const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
    expect(p).toMatchObject({ type: "prd_check", status: "pending" });
    const after = await db.query.documents.findFirst({
      where: (t, { and, eq }) => and(eq(t.projectId, projectId), eq(t.slug, "prd")),
    });
    expect(after?.version).toBe(before?.version);
    // A second proposal for the same finding is refused.
    expect(await code(proposePrdUpdate(alice, slug, { ids: [f.id] }))).toBe("CONFLICT");
  });

  it("refuses findings that need a person, not an append", async () => {
    const prd = await db.query.documents.findFirst({
      where: (t, { and, eq }) => and(eq(t.projectId, projectId), eq(t.slug, "prd")),
    });
    await saveDocument(alice, slug, {
      docSlug: "prd",
      content: `${prd?.content}\n\n## Empty part\nTBD\n`,
      baseVersion: prd?.version ?? 1,
    });
    await drain();
    const [f] = (await open()).filter((x) => x.kind === "placeholder_section");
    expect(await code(proposePrdUpdate(alice, slug, { ids: [f.id] }))).toBe("VALIDATION_ERROR");
  });

  it("is closed to strangers and read-only members", async () => {
    await addRequirement("Loyalty points");
    await drain();
    const [f] = (await open()).filter((x) => x.subject === "Loyalty points");
    for (const who of [stranger, viewer]) {
      const expected = who === stranger ? "NOT_FOUND" : "AUTHORIZATION_ERROR";
      expect(await code(dismissPrdFindings(who, slug, { ids: [f.id] }))).toBe(expected);
      expect(await code(proposePrdUpdate(who, slug, { ids: [f.id] }))).toBe(expected);
    }
    const [row] = await db.select().from(prdFindings).where(eq(prdFindings.id, f.id));
    expect(row.status).toBe("open");
  });

  it("does not touch a finding of another project", async () => {
    const bob = await createUser("Bob");
    const other = await project(bob, "A recipe sharing app for home cooks and friends.");
    await addRequirement("Loyalty points");
    await drain();
    const [f] = (await open()).filter((x) => x.subject === "Loyalty points");
    expect(await code(dismissPrdFindings(bob, other, { ids: [f.id] }))).toBe("OK");
    const [row] = await db.select().from(prdFindings).where(eq(prdFindings.id, f.id));
    expect(row.status).toBe("open");
    expect(await code(proposePrdUpdate(bob, other, { ids: [f.id] }))).toBe("NOT_FOUND");
  });
});
