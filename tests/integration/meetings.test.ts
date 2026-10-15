import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { activities, meetingNotes, projectMembers } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { listNotes, teamCreateNote, teamDeleteNote, teamUpdateNote } from "@/lib/meetings/notes";
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

const note = (over: Record<string, unknown> = {}) => ({
  title: "Kickoff",
  meetingDate: "2026-10-12",
  body: "We agreed on the login flow and the launch date.",
  ...over,
});

let owner: Actor;
let viewer: Actor;
let stranger: Actor;
let slug: string;
let projectId: string;

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  viewer = await createUser("Viewer");
  stranger = await createUser("Stranger");
  slug = await project(owner, "A web shop with login and payments for my bakery.");
  const access = await loadProjectAccess(owner, { slug }, "project:read");
  projectId = access.project.id;
  await db.insert(projectMembers).values({ projectId, userId: viewer.id, role: "viewer" });
});

describe("team meeting notes", () => {
  it("stores a note as ready, internal by default, and records activity", async () => {
    const { id } = await teamCreateNote(owner, slug, note());
    const [row] = await db.select().from(meetingNotes).where(eq(meetingNotes.id, id));
    expect(row).toMatchObject({ side: "team", status: "ready", visibility: "internal" });
    expect(row.authorId).toBe(owner.id);
    const log = await db.select().from(activities).where(eq(activities.entityId, id));
    expect(log.map((a) => a.type)).toEqual(["meeting_note.submitted"]);
    expect((await listNotes(projectId)).map((n) => n.id)).toEqual([id]);
  });

  it("needs write access: viewers are refused and outsiders see nothing", async () => {
    expect(await code(teamCreateNote(viewer, slug, note()))).toBe("AUTHORIZATION_ERROR");
    expect(await code(teamCreateNote(stranger, slug, note()))).toBe("NOT_FOUND");
    expect(await db.select().from(meetingNotes)).toEqual([]);
  });

  it("validates input and strips control characters", async () => {
    expect(await code(teamCreateNote(owner, slug, note({ title: "x" })))).toBe("VALIDATION_ERROR");
    expect(await code(teamCreateNote(owner, slug, note({ meetingDate: "tomorrow" })))).toBe(
      "VALIDATION_ERROR",
    );
    expect(await code(teamCreateNote(owner, slug, note({ body: "short" })))).toBe(
      "VALIDATION_ERROR",
    );
    expect(await code(teamCreateNote(owner, slug, note({ body: "a".repeat(20_001) })))).toBe(
      "VALIDATION_ERROR",
    );
    const { id } = await teamCreateNote(owner, slug, note({ title: "Plan\u0007ning" }));
    const [row] = await db.select().from(meetingNotes).where(eq(meetingNotes.id, id));
    expect(row.title).toBe("Planning");
  });

  it("edits and deletes only within the same project, and never an analyzed note", async () => {
    const { id } = await teamCreateNote(owner, slug, note());
    await teamUpdateNote(owner, slug, id, { title: "Kickoff v2" });
    const [edited] = await db.select().from(meetingNotes).where(eq(meetingNotes.id, id));
    expect(edited.title).toBe("Kickoff v2");

    const otherSlug = await project(stranger, "A recipe sharing app for home cooks and friends.");
    expect(await code(teamUpdateNote(stranger, otherSlug, id, { title: "Hijack" }))).toBe(
      "NOT_FOUND",
    );
    expect(await code(teamDeleteNote(stranger, otherSlug, id))).toBe("NOT_FOUND");

    await db.update(meetingNotes).set({ status: "analyzed" }).where(eq(meetingNotes.id, id));
    expect(await code(teamUpdateNote(owner, slug, id, { title: "Late edit" }))).toBe("CONFLICT");
    expect(await code(teamDeleteNote(owner, slug, id))).toBe("CONFLICT");

    await db.update(meetingNotes).set({ status: "ready" }).where(eq(meetingNotes.id, id));
    await teamDeleteNote(owner, slug, id);
    expect(await db.select().from(meetingNotes)).toEqual([]);
  });

  it("rate limits note creation per person", async () => {
    for (let i = 0; i < 30; i++) await teamCreateNote(owner, slug, note({ title: `Note ${i}` }));
    expect(await code(teamCreateNote(owner, slug, note()))).toBe("RATE_LIMIT");
  });
});
