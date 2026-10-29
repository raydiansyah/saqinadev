import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  auditEvents,
  credentials,
  projectMembers,
  projects,
  repositoryConnections,
} from "@/lib/db/schema";
import { publish, syncServiceEnv } from "@/lib/deploy/service";
import { AppError } from "@/lib/errors";
import { agentsMdFor } from "@/lib/mcp/setup";
import { getServicesState, removeService, saveService } from "@/lib/services/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"]) => {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
};

let owner: Actor;
let viewer: Actor;
let stranger: Actor;
let slug: string;
let projectId: string;

const sent: { path: string; body: unknown }[] = [];
const fakeVercel = (async (url: URL, init: RequestInit) => {
  sent.push({
    path: `${init.method ?? "GET"} ${url.pathname}`,
    body: init.body ? JSON.parse(String(init.body)) : null,
  });
  const key = `${init.method ?? "GET"} ${url.pathname}`;
  const body = (<Record<string, Record<string, unknown>>>{
    "POST /v11/projects": { id: "prj_1", name: "saqina-x" },
    "POST /v10/projects/prj_1/domains": {},
    "POST /v10/projects/prj_1/env": {},
    "POST /v13/deployments": { id: "dep_1", url: "x.vercel.app", readyState: "QUEUED" },
  })[key];
  return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 });
}) as unknown as typeof fetch;
const deps = { fetcher: fakeVercel, env: { VERCEL_TOKEN: "saqina-token" } };

const LIVE = "postgresql://live-user:live-pass@live.example/db";
const BRANCH = "postgresql://prev-user:prev-pass@branch.example/db";

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  viewer = await createUser("Viewer");
  stranger = await createUser("Stranger");
  slug = await project(owner, "Online shop for handmade soap");
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
  projectId = p.id;
  await db.insert(projectMembers).values({ projectId, userId: viewer.id, role: "viewer" });
  await db.insert(repositoryConnections).values({
    projectId,
    provider: "github",
    fullName: "acme/shop",
    status: "connected",
    createdBy: owner.id,
  });
});

describe("databases and sign-in of the app", () => {
  it("keeps keys sealed, shows names only, and waits for the preview values", async () => {
    await saveService(owner, slug, {
      provider: "neon",
      production: { DATABASE_URL: LIVE },
    });
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const state = await getServicesState(access);
    expect(state.services[0]).toMatchObject({ provider: "neon", status: "incomplete" });
    expect(state.issues.map((i) => i.code)).toEqual(["missingPreview"]);
    expect(JSON.stringify(state)).not.toContain("live-pass");
    const [cred] = await db.select().from(credentials).where(eq(credentials.kind, "service"));
    expect(cred.scope).toBe("project");
    expect(cred.ciphertext).not.toContain("live-pass");
  });

  it("refuses to publish until the preview has its own database, and calls nothing at Vercel", async () => {
    sent.length = 0;
    await expectCode(publish(owner, slug, deps), "CONFLICT");
    expect(sent).toEqual([]);
    // Pointing the preview at the live database is not enough.
    await saveService(owner, slug, {
      id: (await getServicesState(await loadProjectAccess(owner, { slug }, "project:read")))
        .services[0].id,
      provider: "neon",
      preview: { DATABASE_URL: LIVE },
    });
    await expectCode(publish(owner, slug, deps), "CONFLICT");
  });

  it("publishes once ready, sending each value to its own environment only", async () => {
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const { services } = await getServicesState(access);
    await saveService(owner, slug, {
      id: services[0].id,
      provider: "neon",
      preview: { DATABASE_URL: BRANCH },
    });
    sent.length = 0;
    await publish(owner, slug, deps);
    const env = sent.find((c) => c.path.endsWith("/env"));
    expect(env?.body).toEqual([
      { key: "DATABASE_URL", value: LIVE, type: "sensitive", target: ["production"] },
      { key: "DATABASE_URL", value: BRANCH, type: "sensitive", target: ["preview"] },
    ]);
    // Variables are set before the deployment starts.
    expect(sent.findIndex((c) => c.path.endsWith("/env"))).toBeLessThan(
      sent.findIndex((c) => c.path === "POST /v13/deployments"),
    );
    expect(await getServicesState(access).then((s) => s.issues)).toEqual([]);
  });

  it("sends changed values to Vercel straight away once the project is published", async () => {
    sent.length = 0;
    await syncServiceEnv(projectId, deps);
    expect(sent.some((c) => c.path === "POST /v10/projects/prj_1/env")).toBe(true);
  });

  it("validates the shape and rejects unknown variables", async () => {
    await expectCode(
      saveService(owner, slug, {
        provider: "clerk",
        label: "Clerk",
        production: { CLERK_SECRET_KEY: "nope" },
      }),
      "VALIDATION_ERROR",
    );
    await expectCode(
      saveService(owner, slug, { provider: "neon", label: "Other", production: { FOO: "x" } }),
      "VALIDATION_ERROR",
    );
    await expectCode(saveService(owner, slug, { provider: "custom" }), "VALIDATION_ERROR");
  });

  it("supports a custom service and keeps values out of the audit log and AGENTS.md", async () => {
    await saveService(owner, slug, {
      provider: "custom",
      kind: "auth",
      label: "Own auth",
      customVars: [{ name: "AUTH_SECRET", secret: true }],
      production: { AUTH_SECRET: "live-secret-value" },
      preview: { AUTH_SECRET: "preview-secret-value" },
    });
    const log = JSON.stringify(await db.select().from(auditEvents));
    expect(log).not.toContain("live-pass");
    expect(log).not.toContain("live-secret-value");
    expect(log).toContain("AUTH_SECRET");
    const md = await agentsMdFor(await loadProjectAccess(owner, { slug }, "project:read"));
    expect(md).toContain("neon (database): DATABASE_URL");
    expect(md).toContain("custom (auth): AUTH_SECRET");
    expect(md).not.toContain("live-secret-value");
    expect(md).not.toContain("branch.example");
  });

  it("only project admins manage it: viewer refused, stranger NOT_FOUND, no cross-project removal", async () => {
    await expectCode(saveService(viewer, slug, { provider: "neon" }), "AUTHORIZATION_ERROR");
    await expectCode(saveService(stranger, slug, { provider: "neon" }), "NOT_FOUND");
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const { services } = await getServicesState(access);
    await expectCode(removeService(stranger, slug, { id: services[0].id }), "NOT_FOUND");
    const other = await project(stranger, "Another project to test with");
    await expectCode(removeService(stranger, other, { id: services[0].id }), "NOT_FOUND");
  });

  it("removing a service revokes its keys", async () => {
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const { services } = await getServicesState(access);
    await removeService(owner, slug, { id: services[0].id });
    const creds = await db.select().from(credentials).where(eq(credentials.kind, "service"));
    expect(creds.filter((c) => !c.revokedAt)).toHaveLength(1);
    expect((await getServicesState(access)).services).toHaveLength(1);
  });
});
