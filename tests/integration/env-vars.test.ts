import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  auditEvents,
  credentials,
  deployTargets,
  projectEnvVars,
  projectMembers,
  projects,
  repositoryConnections,
} from "@/lib/db/schema";
import { removeEnvFromDeployment, syncServiceEnv } from "@/lib/deploy/service";
import {
  addEnvNames,
  getEnvState,
  importEnv,
  loadEnvVarValues,
  removeEnvVar,
  saveEnvVar,
} from "@/lib/env-vars/service";
import { AppError } from "@/lib/errors";
import { agentsMdFor } from "@/lib/mcp/setup";
import { envExampleFor, envLocalFor, saveService } from "@/lib/services/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"], field?: string) => {
  await expect(promise).rejects.toSatisfy(
    (e: unknown) =>
      e instanceof AppError &&
      e.code === code &&
      (field === undefined || Object.values(e.fields ?? {}).includes(field)),
  );
};

let owner: Actor;
let viewer: Actor;
let stranger: Actor;
let other: Actor;
let slug: string;
let otherSlug: string;
let projectId: string;

const SECRET = "sk-live-geocoder-0123456789";
const sent: { path: string; body: unknown }[] = [];
const fakeVercel = (async (url: URL, init: RequestInit) => {
  const key = `${init.method ?? "GET"} ${url.pathname}`;
  sent.push({ path: key, body: init.body ? JSON.parse(String(init.body)) : null });
  const body = (<Record<string, Record<string, unknown>>>{
    "POST /v10/projects/prj_1/env": {},
    "GET /v10/projects/prj_1/env": {
      envs: [
        { id: "e1", key: "GEOCODER_API_KEY" },
        { id: "e2", key: "GEOCODER_API_KEY" },
        { id: "e3", key: "KEEP_ME" },
      ],
    },
    "DELETE /v9/projects/prj_1/env/e1": {},
    "DELETE /v9/projects/prj_1/env/e2": {},
  })[key];
  return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 });
}) as unknown as typeof fetch;
const deps = { fetcher: fakeVercel, env: { VERCEL_TOKEN: "saqina-token" } };

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  viewer = await createUser("Viewer");
  stranger = await createUser("Stranger");
  other = await createUser("Other owner");
  slug = await project(owner, "Online shop for handmade soap");
  otherSlug = await project(other, "A different project for another client");
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
  await db.insert(deployTargets).values({
    projectId,
    owner: "saqina",
    status: "ready",
    vercelProjectId: "prj_1",
    createdBy: owner.id,
  } as never);
});

describe("environment variables of the app", () => {
  it("seals values, shows names and what is filled, and never a value", async () => {
    await saveEnvVar(owner, slug, {
      name: "GEOCODER_API_KEY",
      comment: "Search provider key",
      production: SECRET,
      preview: "sk-test-geocoder-0123456789",
    });
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const state = await getEnvState(access);
    expect(state.vars).toHaveLength(1);
    expect(state.vars[0]).toMatchObject({
      name: "GEOCODER_API_KEY",
      secret: true,
      comment: "Search provider key",
      filled: { production: true, preview: true, development: false },
    });
    expect(JSON.stringify(state)).not.toContain("sk-");
    // The value is stored encrypted, not in the row.
    const rows = await db.select().from(projectEnvVars);
    expect(JSON.stringify(rows)).not.toContain("sk-");
    const [c] = await db.select().from(credentials).where(eq(credentials.kind, "env"));
    expect(c.ciphertext).not.toContain("sk-");
    // The server can read it back to send it on.
    const values = await loadEnvVarValues(projectId);
    expect(values[0]).toMatchObject({ name: "GEOCODER_API_KEY", production: SECRET });
  });

  it("an empty value keeps what is stored; clear removes one environment; a rotated value replaces it", async () => {
    await saveEnvVar(owner, slug, { name: "GEOCODER_API_KEY", development: "dev-value" });
    let v = (await loadEnvVarValues(projectId))[0];
    expect(v).toMatchObject({ production: SECRET, development: "dev-value" });
    await saveEnvVar(owner, slug, {
      name: "GEOCODER_API_KEY",
      preview: "",
      clear: ["development"],
    });
    v = (await loadEnvVarValues(projectId))[0];
    expect(v).toMatchObject({
      production: SECRET,
      preview: "sk-test-geocoder-0123456789",
      development: "",
    });
    await saveEnvVar(owner, slug, { name: "GEOCODER_API_KEY", production: "rotated" });
    expect((await loadEnvVarValues(projectId))[0].production).toBe("rotated");
    await saveEnvVar(owner, slug, { name: "GEOCODER_API_KEY", production: SECRET });
    // One live credential per variable: the old ones are revoked.
    const live = await db.select().from(credentials).where(eq(credentials.kind, "env"));
    expect(live.filter((c) => !c.revokedAt)).toHaveLength(1);
  });

  it("refuses bad, reserved and service-owned names, and never makes a public name secret", async () => {
    await expectCode(saveEnvVar(owner, slug, { name: "lower" }), "VALIDATION_ERROR", "invalid");
    await expectCode(saveEnvVar(owner, slug, { name: "NODE_ENV" }), "VALIDATION_ERROR", "reserved");
    await saveService(owner, slug, {
      provider: "neon",
      production: { DATABASE_URL: "postgresql://u:p@live.example/db" },
      preview: { DATABASE_URL: "postgresql://u:p@branch.example/db" },
    });
    await expectCode(
      saveEnvVar(owner, slug, { name: "DATABASE_URL" }),
      "VALIDATION_ERROR",
      "service",
    );
    await saveEnvVar(owner, slug, {
      name: "NEXT_PUBLIC_MAP_STYLE",
      secret: true,
      production: "dark",
    });
    const state = await getEnvState(await loadProjectAccess(owner, { slug }, "project:read"));
    expect(state.vars.find((x) => x.name === "NEXT_PUBLIC_MAP_STYLE")?.secret).toBe(false);
    // The service's own variable is listed, read only.
    expect(state.fromServices.map((x) => x.name)).toContain("DATABASE_URL");
  });

  it("only project admins change it: viewer refused, stranger NOT_FOUND, nothing crosses projects", async () => {
    await expectCode(
      saveEnvVar(viewer, slug, { name: "X_KEY", production: "v" }),
      "AUTHORIZATION_ERROR",
    );
    await expectCode(saveEnvVar(stranger, slug, { name: "X_KEY", production: "v" }), "NOT_FOUND");
    await expectCode(
      importEnv(viewer, slug, { text: "X=1", environments: ["preview"] }),
      "AUTHORIZATION_ERROR",
    );
    await expectCode(addEnvNames(stranger, slug, { names: ["X_KEY"] }), "NOT_FOUND");
    const mine = (await db.select().from(projectEnvVars)).find(
      (r) => r.name === "GEOCODER_API_KEY",
    );
    await expectCode(removeEnvVar(viewer, slug, { id: mine?.id }), "AUTHORIZATION_ERROR");
    // Another project's admin cannot remove this project's variable by id.
    await expectCode(removeEnvVar(other, otherSlug, { id: mine?.id }), "NOT_FOUND");
    expect(
      await db
        .select()
        .from(projectEnvVars)
        .where(eq(projectEnvVars.id, mine?.id ?? "")),
    ).toHaveLength(1);
    // A viewer can read the names (for the Studio) but not the values.
    const names = await getEnvState(await loadProjectAccess(viewer, { slug }, "project:read"));
    expect(names.vars.length).toBeGreaterThan(0);
  });

  it("imports pasted .env text into chosen environments and says what it did", async () => {
    const result = await importEnv(owner, slug, {
      text: [
        "GEOCODER_API_KEY=changed-should-be-kept",
        "MAP_TILE_URL=https://tiles.example/{z}/{x}/{y}.png",
        "export CACHE_TTL=60 # seconds",
        "DATABASE_URL=postgresql://x",
        "VERCEL_URL=x",
        "oops not a line",
      ].join("\n"),
      environments: ["preview", "development"],
    });
    expect(result.added.sort()).toEqual(["CACHE_TTL", "MAP_TILE_URL"]);
    // Its preview already has a value, which is kept; only the empty development one is filled.
    expect(result.updated).toEqual(["GEOCODER_API_KEY"]);
    expect(result.kept).toEqual([]);
    expect(result.skipped).toEqual(["DATABASE_URL"]);
    expect(result.invalid.map((i) => i.reason).sort()).toEqual(["reserved", "syntax"]);
    const values = Object.fromEntries((await loadEnvVarValues(projectId)).map((v) => [v.name, v]));
    expect(values.CACHE_TTL).toMatchObject({ preview: "60", development: "60", production: "" });
    expect(values.GEOCODER_API_KEY.preview).toBe("sk-test-geocoder-0123456789");
    expect(values.GEOCODER_API_KEY.development).toBe("changed-should-be-kept");

    const again = await importEnv(owner, slug, {
      text: "GEOCODER_API_KEY=overwritten",
      environments: ["preview"],
      overwrite: true,
    });
    expect(again.updated).toEqual(["GEOCODER_API_KEY"]);
    const keptCheck = await importEnv(owner, slug, {
      text: "CACHE_TTL=1",
      environments: ["preview"],
    });
    expect(keptCheck.kept).toEqual(["CACHE_TTL"]);
    expect(
      (await loadEnvVarValues(projectId)).find((v) => v.name === "GEOCODER_API_KEY")?.preview,
    ).toBe("overwritten");
  });

  it("adds names with no value, skipping what exists, is reserved or belongs to a service", async () => {
    const { added } = await addEnvNames(owner, slug, {
      names: ["GEOCODER_API_KEY", "NEW_NAME", "NEW_NAME", "PORT", "DATABASE_URL", "bad-name"],
    });
    expect(added).toEqual(["NEW_NAME"]);
    const state = await getEnvState(await loadProjectAccess(owner, { slug }, "project:read"));
    expect(state.vars.find((x) => x.name === "NEW_NAME")).toMatchObject({
      source: "repository",
      filled: { production: false, preview: false, development: false },
    });
  });

  it("goes to the deployment, per environment, and a removal goes there too", async () => {
    sent.length = 0;
    await syncServiceEnv(projectId, deps);
    const call = sent.find((c) => c.path === "POST /v10/projects/prj_1/env");
    const body = call?.body as Array<{ key: string; type: string; target: string[] }>;
    const geo = body.filter((b) => b.key === "GEOCODER_API_KEY");
    expect(geo.map((b) => b.target[0]).sort()).toEqual(["development", "preview", "production"]);
    expect(geo.find((b) => b.target[0] === "production")?.type).toBe("sensitive");
    expect(geo.find((b) => b.target[0] === "development")?.type).toBe("encrypted");
    expect(body.find((b) => b.key === "NEXT_PUBLIC_MAP_STYLE")?.type).toBe("plain");
    expect(body.some((b) => b.key === "NEW_NAME")).toBe(false);

    sent.length = 0;
    const result = await removeEnvFromDeployment(projectId, ["GEOCODER_API_KEY"], deps);
    expect(result.removed).toBe(true);
    expect(
      sent
        .filter((c) => c.path.startsWith("DELETE"))
        .map((c) => c.path)
        .sort(),
    ).toEqual(["DELETE /v9/projects/prj_1/env/e1", "DELETE /v9/projects/prj_1/env/e2"]);
  });

  it("is in .env.example (names) and .env.local (never the live value), and in AGENTS.md as names only", async () => {
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    expect(await envExampleFor(access)).toContain("GEOCODER_API_KEY=");
    const local = await envLocalFor(owner, slug);
    expect(local).toContain("GEOCODER_API_KEY=");
    expect(local).not.toContain(SECRET);
    expect(local).toContain("CACHE_TTL=");
    const md = await agentsMdFor(access);
    expect(md).toContain("GEOCODER_API_KEY");
    expect(md).not.toContain("overwritten");
    expect(md).not.toContain("tiles.example");
  });

  it("keeps every value out of the audit log, and removing a variable revokes its credential", async () => {
    const mine = (await db.select().from(projectEnvVars)).find((r) => r.name === "CACHE_TTL");
    await removeEnvVar(owner, slug, { id: mine?.id });
    expect(
      await db.select().from(projectEnvVars).where(eq(projectEnvVars.name, "CACHE_TTL")),
    ).toHaveLength(0);
    const log = JSON.stringify(await db.select().from(auditEvents));
    for (const value of [SECRET, "overwritten", "tiles.example", "dev-value", "rotated"])
      expect(log).not.toContain(value);
    expect(log).toContain("GEOCODER_API_KEY");
    expect(log).toContain("env.removed");
  });
});
