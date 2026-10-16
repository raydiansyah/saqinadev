import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProvider, AiRequest } from "@/lib/ai/provider";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { activities, projectMembers, requirements } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { type FileEntry, type GitAdapter, GitError } from "@/lib/git/types";
import { importFromGithub } from "@/lib/imports/service";
import { syncRequirementsFromDocs } from "@/lib/imports/sync";
import { completeInterview } from "@/lib/interviews/service";
import { listRequirements } from "@/lib/requirements/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

const PROSE: Record<string, string> = {
  "README.md": "# Bakery Orders\n\nAn ordering app for a neighbourhood bakery.\n",
  "docs/overview.md":
    "# Overview\n\nThe bakery takes pre-orders until 18:00 the day before. Customers collect them in a pickup slot of their choice, and bakers print a production sheet every morning.\n",
  "package.json": JSON.stringify({ dependencies: { next: "16" } }),
};

const LISTED = {
  ...PROSE,
  "PRD.md": "# PRD\n\n## Features\n- Loyalty stamps: every tenth loaf is free\n",
};

function adapter(files: Record<string, string>): GitAdapter {
  const fail = async (): Promise<never> => {
    throw new GitError("unsupported");
  };
  return {
    provider: "github",
    getRepository: async (ref) => ({
      fullName: ref.fullName,
      externalId: "1",
      defaultBranch: "main",
      headSha: "a",
    }),
    listFiles: async (_r, _t, input) => {
      const dir = input.path ? `${input.path}/` : "";
      return Object.keys(files)
        .filter((p) => p.startsWith(dir) && !p.slice(dir.length).includes("/"))
        .map((p): FileEntry => ({ path: p, type: "file", size: files[p].length }));
    },
    readFile: async (_r, _t, input) => {
      if (!(input.path in files)) throw new GitError("not_found");
      return files[input.path];
    },
    listBranches: fail,
    searchCode: fail,
    createBranch: fail,
    commitChanges: fail,
    createPullRequest: fail,
  };
}

const fakeAi = (value: unknown, deterministic = false) => {
  const seen: { request?: AiRequest; calls: number } = { calls: 0 };
  const p = {
    deterministic,
    config: { provider: "mock" as const, model: "owner-model" },
    generate: async () => "",
    stream: async function* () {},
    generateObject: async (request: AiRequest) => {
      seen.request = request;
      seen.calls += 1;
      if (value instanceof Error) throw value;
      return value;
    },
  };
  return { provider: p as unknown as AiProvider, seen };
};

let owner: Actor;
let viewer: Actor;
let stranger: Actor;

async function imported(files: Record<string, string>, complete = true) {
  const { slug } = await importFromGithub(owner, { repo: "acme/bakery" }, "en", {
    adapter: adapter(files),
    connect: vi.fn(async () => undefined),
  });
  if (complete) await completeInterview(owner, slug);
  const access = await loadProjectAccess(owner, { slug }, "project:read");
  await db
    .insert(projectMembers)
    .values({ projectId: access.project.id, userId: viewer.id, role: "viewer" });
  return { slug, projectId: access.project.id };
}

const titles = async (slug: string) =>
  (await listRequirements(await loadProjectAccess(owner, { slug }, "project:read"))).map(
    (r) => r.title,
  );

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  viewer = await createUser("Viewer");
  stranger = await createUser("Stranger");
});

describe("updating requirements from the repository documents", () => {
  it("adds only what the project does not have and is safe to repeat", async () => {
    const { slug, projectId } = await imported(LISTED, false);
    // The interview is not finished, so nothing from the documents is in yet.
    expect((await titles(slug)).some((t) => /loyalty/i.test(t))).toBe(false);

    const first = await syncRequirementsFromDocs(owner, slug, {}, "en");
    expect(first).toMatchObject({ noDocs: false, ai: null });
    expect(first.added).toBeGreaterThan(0);
    expect((await titles(slug)).some((t) => /loyalty/i.test(t))).toBe(true);

    const before = (
      await db.select().from(requirements).where(eq(requirements.projectId, projectId))
    ).length;
    const again = await syncRequirementsFromDocs(owner, slug, {}, "en");
    expect(again.added).toBe(0);
    expect(
      (await db.select().from(requirements).where(eq(requirements.projectId, projectId))).length,
    ).toBe(before);
  });

  it("brings an already finished project up to date, without touching what exists", async () => {
    const { slug, projectId } = await imported(LISTED);
    const rows = await db.select().from(requirements).where(eq(requirements.projectId, projectId));
    const loyalty = rows.find((r) => /loyalty/i.test(r.title));
    expect(loyalty).toBeDefined();
    // A project finished before documents were read has no such requirement, and was edited by hand.
    await db.delete(requirements).where(eq(requirements.id, loyalty?.id ?? ""));
    const other = rows.find((r) => r.id !== loyalty?.id) as (typeof rows)[number];
    await db
      .update(requirements)
      .set({ title: "Edited by hand", status: "confirmed" })
      .where(eq(requirements.id, other.id));

    const result = await syncRequirementsFromDocs(owner, slug, {}, "en");
    expect(result.added).toBe(1);
    expect((await titles(slug)).some((t) => /loyalty/i.test(t))).toBe(true);
    const [edited] = await db.select().from(requirements).where(eq(requirements.id, other.id));
    expect(edited).toMatchObject({ title: "Edited by hand", status: "confirmed" });
  });

  it("records one activity entry for what it added", async () => {
    const { slug, projectId } = await imported(LISTED, false);
    const { added } = await syncRequirementsFromDocs(owner, slug, {}, "en");
    const log = await db.select().from(activities).where(eq(activities.projectId, projectId));
    const entry = log.find((a) => a.metadata && (a.metadata as { count?: number }).count === added);
    expect(entry?.type).toBe("requirement.created");
  });

  it("says so when the project has no repository documents", async () => {
    const slug = await project(owner, "A web shop with login and payments for my bakery.");
    expect(await syncRequirementsFromDocs(owner, slug, {}, "en")).toMatchObject({
      added: 0,
      noDocs: true,
    });
  });

  it("needs write access", async () => {
    const { slug } = await imported(LISTED, false);
    expect(await code(syncRequirementsFromDocs(viewer, slug, {}, "en"))).toBe(
      "AUTHORIZATION_ERROR",
    );
    expect(await code(syncRequirementsFromDocs(stranger, slug, {}, "en"))).toBe("NOT_FOUND");
  });
});

describe("reading prose documents with AI", () => {
  const reply = (items: unknown[]) => ({ items });
  const good = {
    group: "business_rules",
    title: "Pre-orders close the day before",
    description: "Orders stop at 18:00 the day before pickup.",
    quote: "takes pre-orders until 18:00 the day before",
  };

  it("finds nothing in prose without a model: the rules need lists", async () => {
    const { slug } = await imported(PROSE, false);
    expect((await syncRequirementsFromDocs(owner, slug, {}, "en")).added).toBe(0);
  });

  it("adds items the documents back with a quote, and drops the rest", async () => {
    const { slug } = await imported(PROSE, false);
    const { provider, seen } = fakeAi(
      reply([
        good,
        { ...good, title: "Bitcoin payments", quote: "customers may pay with bitcoin" },
      ]),
    );
    const result = await syncRequirementsFromDocs(owner, slug, { useAi: true }, "en", { provider });
    expect(result).toMatchObject({ ai: "used", fromAi: 1 });
    const all = await titles(slug);
    expect(all).toContain("Pre-orders close the day before");
    expect(all).not.toContain("Bitcoin payments");
    // Documents are untrusted data; they are never part of the instructions.
    expect(seen.request?.segments.every((s) => s.kind === "external")).toBe(true);
  });

  it("marks AI findings as inferred and imported with the document as source", async () => {
    const { slug, projectId } = await imported(PROSE, false);
    await syncRequirementsFromDocs(owner, slug, { useAi: true }, "en", {
      provider: fakeAi(reply([good])).provider,
    });
    const rows = await db.select().from(requirements).where(eq(requirements.projectId, projectId));
    const row = rows.find((r) => r.title === good.title);
    expect(row).toMatchObject({ status: "inferred", source: "imported", group: "business_rules" });
    expect(row?.description).toContain("Source: docs/overview.md (read by AI)");
  });

  it("does not repeat what the rules already found or the project already has", async () => {
    const { slug } = await imported(LISTED, false);
    const dup = {
      ...good,
      title: "Loyalty stamps give every tenth loaf free",
      quote: "every tenth loaf is free",
    };
    const result = await syncRequirementsFromDocs(owner, slug, { useAi: true }, "en", {
      provider: fakeAi(reply([dup, good])).provider,
    });
    expect(result.fromAi).toBe(1);
    expect((await titles(slug)).filter((t) => /loyalty/i.test(t))).toHaveLength(1);
  });

  it("falls back to the rules with a clear result when there is no model or it fails", async () => {
    const { slug } = await imported(LISTED, false);
    const none = await syncRequirementsFromDocs(owner, slug, { useAi: true }, "en", {
      provider: fakeAi(null, true).provider,
    });
    expect(none).toMatchObject({ ai: "unavailable", aiProblem: { reason: "no_model" }, fromAi: 0 });
    expect(none.added).toBeGreaterThan(0);

    const other = await imported(LISTED, false);
    const broken = await syncRequirementsFromDocs(owner, other.slug, { useAi: true }, "en", {
      provider: fakeAi(new Error("401 invalid x-api-key")).provider,
    });
    expect(broken).toMatchObject({
      ai: "unavailable",
      aiProblem: { reason: "provider_failed" },
      fromAi: 0,
    });
    expect(broken.added).toBeGreaterThan(0);
  });

  it("ignores a malformed answer and never calls the model without consent", async () => {
    const { slug } = await imported(PROSE, false);
    const bad = await syncRequirementsFromDocs(owner, slug, { useAi: true }, "en", {
      provider: fakeAi({ items: [{ title: "x", group: "nope", quote: "q" }] }).provider,
    });
    expect(bad).toMatchObject({
      ai: "unavailable",
      aiProblem: { reason: "provider_failed" },
      added: 0,
    });
    const spy = fakeAi(reply([good]));
    await syncRequirementsFromDocs(owner, slug, {}, "en", { provider: spy.provider });
    expect(spy.seen.calls).toBe(0);
  });
});
