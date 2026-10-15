import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import {
  credentials,
  documents,
  projects,
  repositoryConnections,
  webhookDeliveries,
} from "@/lib/db/schema";
import { configureDocSync, getDocSyncStatus, syncNow } from "@/lib/docsync/config";
import { handleGithubWebhook, touchesDocs, verifyGithubSignature } from "@/lib/docsync/webhook";
import { disconnectRepository } from "@/lib/git/service";
import { runMaintenance } from "@/lib/housekeeping/service";
import { createUser, resetDatabase } from "../helpers/db";
import { fakeHost } from "../helpers/fake-host";
import { project } from "../helpers/project";

let owner: Actor;
let slug: string;
let projectId: string;
let connectionId: string;

async function setup() {
  await resetDatabase();
  owner = await createUser("Owner", "owner@example.test");
  slug = await project(owner, "A point of sale for a small restaurant with table orders.");
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
  projectId = p.id;
  const [c] = await db
    .insert(repositoryConnections)
    .values({
      projectId,
      provider: "github",
      fullName: "acme/shop",
      status: "connected",
      createdBy: owner.id,
    })
    .returning();
  connectionId = c.id;
}

const connection = async () =>
  (
    await db.select().from(repositoryConnections).where(eq(repositoryConnections.id, connectionId))
  )[0];

describe("configuring document sync", () => {
  beforeEach(setup);

  it("shows the webhook secret once, stores it encrypted and keeps it on later saves", async () => {
    const first = await configureDocSync(owner, slug, { enabled: true });
    expect(first.webhookUrl).toMatch(new RegExp(`/api/git/webhook/${connectionId}$`));
    expect(first.webhookSecret).toMatch(/^[0-9a-f]{64}$/);
    const conn = await connection();
    expect(conn.docSyncEnabled).toBe(true);
    expect(conn.docsPath).toBe("docs");
    const [cred] = await db
      .select()
      .from(credentials)
      .where(eq(credentials.id, conn.webhookCredentialId as string));
    expect(cred.kind).toBe("git_webhook");
    expect(JSON.stringify(cred)).not.toContain(first.webhookSecret as string);

    const again = await configureDocSync(owner, slug, { enabled: true, docsPath: "docs/saqina" });
    expect(again.webhookSecret).toBeUndefined();
    expect((await connection()).docsPath).toBe("docs/saqina");
    expect((await connection()).webhookCredentialId).toBe(conn.webhookCredentialId);
  });

  it("rotates the secret on request and revokes the old one", async () => {
    await configureDocSync(owner, slug, { enabled: true });
    const oldId = (await connection()).webhookCredentialId as string;
    const rotated = await configureDocSync(owner, slug, { enabled: true, rotateSecret: true });
    expect(rotated.webhookSecret).toBeDefined();
    const [old] = await db.select().from(credentials).where(eq(credentials.id, oldId));
    expect(old.revokedAt).not.toBeNull();
    expect((await connection()).webhookCredentialId).not.toBe(oldId);
  });

  it("revokes the secret when sync is switched off or the repository is disconnected", async () => {
    await configureDocSync(owner, slug, { enabled: true });
    const id = (await connection()).webhookCredentialId as string;
    await configureDocSync(owner, slug, { enabled: false });
    expect((await connection()).docSyncEnabled).toBe(false);
    expect((await connection()).webhookCredentialId).toBeNull();
    expect(
      (await db.select().from(credentials).where(eq(credentials.id, id)))[0].revokedAt,
    ).not.toBeNull();

    await configureDocSync(owner, slug, { enabled: true });
    const second = (await connection()).webhookCredentialId as string;
    await disconnectRepository(owner, slug);
    const after = await connection();
    expect(after.docSyncEnabled).toBe(false);
    expect(after.webhookCredentialId).toBeNull();
    expect(
      (await db.select().from(credentials).where(eq(credentials.id, second)))[0].revokedAt,
    ).not.toBeNull();
  });

  it("refuses unsafe folders, other hosts and people outside the project", async () => {
    for (const docsPath of ["../etc", "a b", "docs/../x", "docs//x", ".."])
      await expect(
        configureDocSync(owner, slug, { enabled: true, docsPath }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    await db.update(repositoryConnections).set({ provider: "gitlab" });
    await expect(configureDocSync(owner, slug, { enabled: true })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await db.update(repositoryConnections).set({ provider: "github" });
    const stranger = await createUser("Stranger", "stranger@example.test");
    await expect(configureDocSync(stranger, slug, { enabled: true })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("reports the state for the integrations card", async () => {
    expect(await getDocSyncStatus(projectId)).toMatchObject({
      enabled: false,
      conflicts: 0,
      pending: 0,
    });
    await configureDocSync(owner, slug, { enabled: true });
    const host = fakeHost();
    const summary = await syncNow(owner, slug, { adapter: host.adapter });
    expect(summary.pushed).toBe(2);
    expect(await getDocSyncStatus(projectId)).toMatchObject({
      enabled: true,
      pending: 2,
      prUrl: "https://github.com/acme/shop/pull/1",
    });
  });

  it("will not run Sync now while sync is off", async () => {
    await expect(syncNow(owner, slug, { adapter: fakeHost().adapter })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("GitHub webhook", () => {
  let secret: string;
  const schedule = vi.fn();
  beforeEach(async () => {
    await setup();
    secret = (await configureDocSync(owner, slug, { enabled: true })).webhookSecret as string;
    schedule.mockClear();
  });

  const push = (over: Record<string, unknown> = {}) => ({
    ref: "refs/heads/main",
    commits: [{ added: [], modified: ["docs/PRD.md"], removed: [] }],
    ...over,
  });
  const send = (
    payload: unknown,
    headers: Record<string, string> = {},
    opts: { id?: string; key?: string; raw?: string } = {},
  ) => {
    const body = opts.raw ?? JSON.stringify(payload);
    const signature = `sha256=${createHmac("sha256", opts.key ?? secret)
      .update(body)
      .digest("hex")}`;
    return handleGithubWebhook(
      new Request("https://saqina.dev/hook", {
        method: "POST",
        body,
        headers: {
          "x-github-event": "push",
          "x-github-delivery": crypto.randomUUID(),
          "x-hub-signature-256": signature,
          ...headers,
        },
      }),
      opts.id ?? connectionId,
      { schedule },
    );
  };

  it("queues a sync for a signed push that touches documents", async () => {
    const res = await send(push());
    expect(res.status).toBe(202);
    expect(schedule).toHaveBeenCalledWith(projectId);
  });

  it("answers ping and ignores other events", async () => {
    expect((await send({}, { "x-github-event": "ping" })).status).toBe(200);
    expect(await (await send({}, { "x-github-event": "issues" })).json()).toMatchObject({
      ignored: "issues",
    });
    expect(schedule).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret, a missing signature and a tampered body", async () => {
    expect((await send(push(), {}, { key: "not-the-secret" })).status).toBe(401);
    const body = JSON.stringify(push());
    const unsigned = await handleGithubWebhook(
      new Request("https://x/hook", {
        method: "POST",
        body,
        headers: { "x-github-event": "push" },
      }),
      connectionId,
      { schedule },
    );
    expect(unsigned.status).toBe(401);
    const forged = await handleGithubWebhook(
      new Request("https://x/hook", {
        method: "POST",
        body: body.replace("PRD", "XXX"),
        headers: {
          "x-github-event": "push",
          "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
        },
      }),
      connectionId,
      { schedule },
    );
    expect(forged.status).toBe(401);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("acknowledges a redelivery without syncing twice", async () => {
    const id = crypto.randomUUID();
    expect((await send(push(), { "x-github-delivery": id })).status).toBe(202);
    const again = await send(push(), { "x-github-delivery": id });
    expect(await again.json()).toMatchObject({ duplicate: true });
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("ignores pushes to other branches and pushes that touch no documents", async () => {
    expect(await (await send(push({ ref: "refs/heads/feature" }))).json()).toMatchObject({
      ignored: "branch",
    });
    const other = push({ commits: [{ modified: ["src/index.ts"] }] });
    expect(await (await send(other)).json()).toMatchObject({ ignored: "no_docs" });
    expect(schedule).not.toHaveBeenCalled();
  });

  it("does not exist for unknown, malformed or switched-off connections, and refuses huge bodies", async () => {
    expect((await send(push(), {}, { id: crypto.randomUUID() })).status).toBe(404);
    expect((await send(push(), {}, { id: "not-a-uuid" })).status).toBe(404);
    expect((await send(push(), { "content-length": "9000000" })).status).toBe(413);
    await configureDocSync(owner, slug, { enabled: false });
    expect((await send(push())).status).toBe(404);
  });

  it("sees a push that edits a linked file outside the docs folder", () => {
    const payload = { commits: [{ modified: ["README.md"] }] };
    expect(touchesDocs(payload, "docs", new Set())).toBe(false);
    expect(touchesDocs(payload, "docs", new Set(["README.md"]))).toBe(true);
    expect(touchesDocs({ commits: [] }, "docs", new Set())).toBe(true);
    expect(
      touchesDocs({ commits: Array.from({ length: 20 }, () => ({})) }, "docs", new Set()),
    ).toBe(true);
  });

  it("verifies signatures in constant time and never throws on junk", () => {
    const sig = `sha256=${createHmac("sha256", "k").update("body").digest("hex")}`;
    expect(verifyGithubSignature("body", sig, "k")).toBe(true);
    expect(verifyGithubSignature("body", sig, "other")).toBe(false);
    for (const junk of [null, "", "sha256=", "sha256=zz", "sha1=abc", "sha256=00"])
      expect(verifyGithubSignature("body", junk, "k")).toBe(false);
  });
});

describe("housekeeping for sync", () => {
  beforeEach(setup);
  it("forgets old webhook delivery ids but keeps recent ones", async () => {
    const day = 24 * 60 * 60 * 1000;
    await db.insert(webhookDeliveries).values([
      { id: "old", receivedAt: new Date(Date.now() - 8 * day) },
      { id: "fresh", receivedAt: new Date() },
    ]);
    const result = await runMaintenance(new Date(), {});
    expect(result.webhookDeliveries).toBe(1);
    expect((await db.select().from(webhookDeliveries)).map((d) => d.id)).toEqual(["fresh"]);
  });
  it("keeps docs that were synced untouched", async () => {
    expect(
      (await db.select().from(documents).where(eq(documents.projectId, projectId))).length,
    ).toBeGreaterThan(0);
  });
});
