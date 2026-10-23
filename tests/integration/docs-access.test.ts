import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { acceptInvitation, createInvitation } from "@/lib/clients/invitations";
import { createClient, setProjectClient } from "@/lib/clients/service";
import { db } from "@/lib/db/client";
import { projectMembers } from "@/lib/db/schema";
import { canReadDocs } from "@/lib/docs/access";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

let owner: Actor;
let client: Actor;
let newcomer: Actor;
let both: Actor;

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner", "owner@example.test");
  newcomer = await createUser("Newcomer", "newcomer@example.test");
  const slug = await project(owner, "A restaurant point of sale app for my cafe with stock.");
  const c = await createClient(owner, { name: "PT ABC", email: "budi@example.test" });
  await setProjectClient(owner, slug, { clientId: c.id, portalEnabled: true, currency: "IDR" });
  const { url } = await createInvitation(owner, c.id, { email: "budi@example.test" });
  client = await createUser("Budi", "budi@example.test");
  await acceptInvitation(client, url.split("/invite/")[1]);

  // Someone who is a client of one company and a member of a project of another.
  both = await createUser("Both", "both@example.test");
  const second = await createInvitation(owner, c.id, { email: "both@example.test" });
  await acceptInvitation(both, second.url.split("/invite/")[1]);
  const other = await project(newcomer, "A recipe sharing app for home cooks and friends.");
  const otherId = (await loadProjectAccess(newcomer, { slug: other }, "project:read")).project.id;
  await db.insert(projectMembers).values({ projectId: otherId, userId: both.id, role: "viewer" });
});

describe("who may read which guides", () => {
  it("lets the team read the team's guides, and not the clients'", async () => {
    expect(await canReadDocs(owner, "owner")).toBe(true);
    expect(await canReadDocs(owner, "client")).toBe(false);
  });

  it("lets a new account with no project yet read the team's guides: that is where it starts", async () => {
    expect(await canReadDocs(newcomer, "owner")).toBe(true);
    expect(await canReadDocs(newcomer, "client")).toBe(false);
  });

  it("lets a client read the clients' guides only", async () => {
    expect(await canReadDocs(client, "client")).toBe(true);
    expect(await canReadDocs(client, "owner")).toBe(false);
  });

  it("lets someone who is both read both", async () => {
    expect(await canReadDocs(both, "owner")).toBe(true);
    expect(await canReadDocs(both, "client")).toBe(true);
  });
});
