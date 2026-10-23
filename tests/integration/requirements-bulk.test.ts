import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { activities, projectMembers, requirements } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { bulkDeleteRequirements, bulkUpdateRequirements } from "@/lib/requirements/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

let owner: Actor;
let viewer: Actor;
let stranger: Actor;
let slug: string;
let otherSlug: string;
let projectId: string;
let ids: string[];
let otherIds: string[];

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};
const rowsOf = async (pid: string) =>
  db.select().from(requirements).where(eq(requirements.projectId, pid));

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner", "owner@example.test");
  viewer = await createUser("Viewer", "viewer@example.test");
  stranger = await createUser("Stranger", "stranger@example.test");
  slug = await project(owner, "A point of sale for a small restaurant with table orders.");
  otherSlug = await project(stranger, "A recipe sharing app for home cooks and friends.");
  projectId = (await loadProjectAccess(owner, { slug }, "project:read")).project.id;
  await db.insert(projectMembers).values({ projectId, userId: viewer.id, role: "viewer" });
  ids = (await rowsOf(projectId)).map((r) => r.id);
  const otherId = (await loadProjectAccess(stranger, { slug: otherSlug }, "project:read")).project
    .id;
  otherIds = (await rowsOf(otherId)).map((r) => r.id);
});

describe("bulk requirement actions", () => {
  it("sets status, priority and group on every selected requirement and nothing else", async () => {
    const picked = ids.slice(0, 3);
    const result = await bulkUpdateRequirements(owner, slug, {
      ids: picked,
      patch: { status: "confirmed", priority: "low" },
    });
    expect(result.updated).toBe(3);
    const rows = await rowsOf(projectId);
    for (const r of rows.filter((x) => picked.includes(x.id)))
      expect(r).toMatchObject({ status: "confirmed", priority: "low" });
    const before = rows.find((r) => !picked.includes(r.id));
    expect(before?.priority === "low" && before.status === "confirmed").toBe(false);
  });

  it("changes only the fields that are given", async () => {
    const [first] = await rowsOf(projectId);
    await bulkUpdateRequirements(owner, slug, { ids: [first.id], patch: { group: "data" } });
    const after = (await rowsOf(projectId)).find((r) => r.id === first.id);
    expect(after).toMatchObject({ group: "data", priority: first.priority, status: first.status });
  });

  it("records one activity entry for the whole change", async () => {
    const before = (await db.select().from(activities).where(eq(activities.projectId, projectId)))
      .length;
    await bulkUpdateRequirements(owner, slug, {
      ids: ids.slice(0, 4),
      patch: { status: "unknown" },
    });
    const after = await db.select().from(activities).where(eq(activities.projectId, projectId));
    expect(after.length).toBe(before + 1);
    expect(after.find((x) => x.metadata.bulk)?.metadata).toMatchObject({ bulk: true, count: 4 });
  });

  it("is all or nothing: an id from another project refuses everything", async () => {
    const snapshot = await rowsOf(projectId);
    expect(
      await code(
        bulkUpdateRequirements(owner, slug, {
          ids: [ids[0], otherIds[0]],
          patch: { priority: "critical" },
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(await rowsOf(projectId)).toEqual(snapshot);
    expect(
      (await db.select().from(requirements)).filter((r) => otherIds.includes(r.id)),
    ).toHaveLength(otherIds.length);
  });

  it("deletes the selected ones, and refuses a foreign id without deleting anything", async () => {
    expect(await code(bulkDeleteRequirements(owner, slug, { ids: [ids[0], otherIds[0]] }))).toBe(
      "NOT_FOUND",
    );
    expect(await rowsOf(projectId)).toHaveLength(ids.length);
    const result = await bulkDeleteRequirements(owner, slug, { ids: ids.slice(0, 2) });
    expect(result.deleted).toBe(2);
    expect(await rowsOf(projectId)).toHaveLength(ids.length - 2);
  });

  it("is for people who can write, and validates the request", async () => {
    expect(
      await code(bulkUpdateRequirements(viewer, slug, { ids, patch: { status: "unknown" } })),
    ).toBe("AUTHORIZATION_ERROR");
    expect(
      await code(bulkUpdateRequirements(stranger, slug, { ids, patch: { status: "unknown" } })),
    ).toBe("NOT_FOUND");
    expect(
      await code(bulkUpdateRequirements(owner, slug, { ids: [], patch: { status: "unknown" } })),
    ).toBe("VALIDATION_ERROR");
    expect(await code(bulkUpdateRequirements(owner, slug, { ids, patch: {} }))).toBe(
      "VALIDATION_ERROR",
    );
    expect(
      await code(bulkUpdateRequirements(owner, slug, { ids, patch: { status: "nope" } })),
    ).toBe("VALIDATION_ERROR");
    expect(await code(bulkDeleteRequirements(viewer, slug, { ids }))).toBe("AUTHORIZATION_ERROR");
  });
});
