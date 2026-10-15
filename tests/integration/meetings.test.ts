import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { acceptInvitation, createInvitation } from "@/lib/clients/invitations";
import { createClient, setProjectClient } from "@/lib/clients/service";
import { db } from "@/lib/db/client";
import { activities, meetingNotes, notifications, projectMembers } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import {
  clientConfirmNote,
  clientCreateNote,
  clientDeleteNote,
  listNotes,
  reviewClientNote,
  teamCreateNote,
  teamDeleteNote,
  teamUpdateNote,
} from "@/lib/meetings/notes";
import { loadClientProjectAccess } from "@/lib/portal/access";
import { clientNoteList } from "@/lib/portal/engagement-views";
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

describe("client meeting notes", () => {
  let client: Actor;
  let otherClient: Actor;

  beforeEach(async () => {
    const c = await createClient(owner, { name: "PT ABC", email: "budi@abc.test" });
    await setProjectClient(owner, slug, { clientId: c.id, portalEnabled: true, currency: "IDR" });
    const { url } = await createInvitation(owner, c.id, { email: "budi@abc.test" });
    client = await createUser("Budi", "budi@abc.test");
    await acceptInvitation(client, url.split("/invite/")[1]);
    // Someone with portal access to a different client's project.
    const other = await project(stranger, "A recipe sharing app for home cooks and friends.");
    const c2 = await createClient(stranger, { name: "Other Co", email: "x@other.test" });
    await setProjectClient(stranger, other, {
      clientId: c2.id,
      portalEnabled: true,
      currency: "IDR",
    });
    const inv = await createInvitation(stranger, c2.id, { email: "x@other.test" });
    otherClient = await createUser("Other", "x@other.test");
    await acceptInvitation(otherClient, inv.url.split("/invite/")[1]);
  });

  const row = async (id: string) =>
    (await db.select().from(meetingNotes).where(eq(meetingNotes.id, id)))[0];

  it("starts a client note in review, always shared, and tells the team", async () => {
    const { id } = await clientCreateNote(client, slug, note({ visibility: "internal" }));
    expect(await row(id)).toMatchObject({
      side: "client",
      status: "pending_review",
      visibility: "shared",
    });
    const sent = await db.select().from(notifications).where(eq(notifications.userId, owner.id));
    expect(sent.map((n) => n.type)).toContain("meeting_note.submitted");
  });

  it("refuses clients of other projects", async () => {
    expect(await code(clientCreateNote(otherClient, slug, note()))).toBe("NOT_FOUND");
    expect(await code(clientCreateNote(stranger, slug, note()))).toBe("NOT_FOUND");
    expect(await db.select().from(meetingNotes)).toEqual([]);
  });

  it("only shows the client their own notes and shared team notes, without internal state", async () => {
    await teamCreateNote(owner, slug, note({ title: "Internal plan", visibility: "internal" }));
    const shared = await teamCreateNote(
      owner,
      slug,
      note({ title: "Shared recap", visibility: "shared" }),
    );
    const mine = await clientCreateNote(client, slug, note({ title: "My notes" }));
    const list = await clientNoteList(await loadClientProjectAccess(client, slug));
    expect(list.map((n) => n.title).sort()).toEqual(["My notes", "Shared recap"]);
    const teamNote = list.find((n) => n.id === shared.id);
    expect(teamNote?.status).toBeNull();
    expect(list.find((n) => n.id === mine.id)?.status).toBe("pending_review");
    expect(JSON.stringify(list)).not.toContain("reviewedBy");
  });

  it("lets the client confirm a shared team note once, never an internal one", async () => {
    const shared = await teamCreateNote(owner, slug, note({ visibility: "shared" }));
    const internal = await teamCreateNote(owner, slug, note({ visibility: "internal" }));
    expect(await code(clientConfirmNote(client, slug, internal.id))).toBe("NOT_FOUND");
    expect(await code(clientConfirmNote(otherClient, slug, shared.id))).toBe("NOT_FOUND");
    await clientConfirmNote(client, slug, shared.id);
    await clientConfirmNote(client, slug, shared.id);
    expect((await row(shared.id)).clientConfirmedBy).toBe(client.id);
    const log = await db.select().from(activities).where(eq(activities.entityId, shared.id));
    expect(log.filter((a) => a.type === "meeting_note.confirmed")).toHaveLength(1);
  });

  it("is reviewed by the team: approve or decline with a reason, once", async () => {
    const a = await clientCreateNote(client, slug, note({ title: "Approve me" }));
    const b = await clientCreateNote(client, slug, note({ title: "Decline me" }));
    expect(await code(reviewClientNote(viewer, slug, a.id, { decision: "approve" }))).toBe(
      "AUTHORIZATION_ERROR",
    );
    expect(await code(reviewClientNote(client, slug, a.id, { decision: "approve" }))).toBe(
      "NOT_FOUND",
    );
    expect(
      await code(reviewClientNote(owner, slug, b.id, { decision: "decline", note: "no" })),
    ).toBe("VALIDATION_ERROR");
    await reviewClientNote(owner, slug, a.id, { decision: "approve" });
    await reviewClientNote(owner, slug, b.id, {
      decision: "decline",
      note: "Out of our agreed scope.",
    });
    expect(await row(a.id)).toMatchObject({
      status: "approved_for_analysis",
      reviewedBy: owner.id,
    });
    expect(await row(b.id)).toMatchObject({
      status: "declined",
      reviewNote: "Out of our agreed scope.",
    });
    expect(
      await code(
        reviewClientNote(owner, slug, a.id, { decision: "decline", note: "changed my mind" }),
      ),
    ).toBe("CONFLICT");
    const types = (
      await db.select().from(notifications).where(eq(notifications.userId, client.id))
    ).map((n) => n.type);
    expect(types).toEqual(
      expect.arrayContaining(["meeting_note.accepted", "meeting_note.declined"]),
    );
    // The client sees the reason for a declined note, and the approved one reads as accepted.
    const list = await clientNoteList(await loadClientProjectAccess(client, slug));
    expect(list.find((n) => n.id === b.id)).toMatchObject({
      status: "declined",
      reviewNote: "Out of our agreed scope.",
    });
    expect(list.find((n) => n.id === a.id)?.status).toBe("accepted");
  });

  it("lets a client withdraw only their own note, and only before review", async () => {
    const mine = await clientCreateNote(client, slug, note());
    expect(await code(clientDeleteNote(otherClient, slug, mine.id))).toBe("NOT_FOUND");
    const teamOwned = await teamCreateNote(owner, slug, note({ visibility: "shared" }));
    expect(await code(clientDeleteNote(client, slug, teamOwned.id))).toBe("NOT_FOUND");
    await reviewClientNote(owner, slug, mine.id, { decision: "approve" });
    expect(await code(clientDeleteNote(client, slug, mine.id))).toBe("CONFLICT");
    const second = await clientCreateNote(client, slug, note({ title: "Mistake" }));
    await clientDeleteNote(client, slug, second.id);
    expect(await db.select().from(meetingNotes).where(eq(meetingNotes.id, second.id))).toEqual([]);
  });
});
