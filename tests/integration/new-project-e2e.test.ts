import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { listRuns } from "@/lib/agents/runs";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  agentRuns,
  deployments,
  documents,
  projects,
  proposals,
  repositoryConnections,
  tasks,
  users,
} from "@/lib/db/schema";
import { getDeployState, publish } from "@/lib/deploy/service";
import { getDocument, setDocumentStatus } from "@/lib/documents/service";
import { AppError } from "@/lib/errors";
import { agentsMdFor } from "@/lib/mcp/setup";
import { approveProposal } from "@/lib/proposals/service";
import { getServicesState, saveService } from "@/lib/services/service";
import { startBuilding } from "@/lib/studio/kickoff";
import { canStartBuilding } from "@/lib/studio/ready";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"]) => {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
};

/** A Vercel stand-in that records every call. */
const sent: { call: string; body: unknown }[] = [];
const vercel = (async (url: URL, init: RequestInit) => {
  const call = `${init.method ?? "GET"} ${url.pathname}`;
  sent.push({ call, body: init.body ? JSON.parse(String(init.body)) : null });
  const known = <Record<string, Record<string, unknown>>>{
    "POST /v11/projects": { id: "prj_new", name: "saqina-new" },
    "POST /v10/projects/prj_new/domains": {},
    "POST /v10/projects/prj_new/env": {},
    "POST /v13/deployments": { id: "dep_new", url: "new.vercel.app", readyState: "QUEUED" },
  };
  const body = known[call];
  return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 });
}) as unknown as typeof fetch;
const deps = { fetcher: vercel, env: { VERCEL_TOKEN: "saqina-token" } };

let owner: Actor;
let slug: string;
let projectId: string;

beforeAll(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
});

/** A brand-new project built in Saqina, from the idea to a published, previewable app. */
describe("a new project built in Saqina, start to finish", () => {
  it("starts with a PRD and a plan, built in Saqina, and cannot start building before approval", async () => {
    slug = await project(owner, "Online shop for handmade soap and candles");
    const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
    projectId = p.id;
    expect(p.buildStrategy).toBe("saqina");
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const prd = await getDocument(access, "prd");
    expect(prd).toBeTruthy();
    expect(
      canStartBuilding({ slug: "prd", type: "prd", status: prd?.status ?? "", reference: null }),
    ).toBe(prd?.status === "approved");
    const plan = await db.select().from(tasks).where(eq(tasks.projectId, projectId));
    expect(plan.length).toBeGreaterThan(0);
  });

  it("an approved PRD opens Start building, and each open task goes to a fitting agent", async () => {
    await setDocumentStatus(owner, slug, { docSlug: "prd", status: "approved" });
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const prd = await getDocument(access, "prd");
    expect(
      canStartBuilding({ slug: "prd", type: "prd", status: prd?.status ?? "", reference: null }),
    ).toBe(true);

    const result = await startBuilding(owner, slug);
    expect(result.mode).toBe("agents");
    expect(result.started).toBeGreaterThan(0);

    const runs = await listRuns(access, { limit: 50 });
    expect(runs.length).toBe(result.started);
    // Every run is from a Saqina team agent, tied to a task.
    expect(runs.every((r) => r.agentName && r.taskTitle)).toBe(true);
  });

  it("agents finish into proposals; nothing changes until a person approves", async () => {
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.projectId, projectId));
    expect(
      runs.every((r) => ["succeeded", "waiting", "failed", "running", "queued"].includes(r.status)),
    ).toBe(true);
    const pending = await db
      .select()
      .from(proposals)
      .where(and(eq(proposals.projectId, projectId), eq(proposals.status, "pending")));
    if (pending.length > 0) {
      await approveProposal(owner, slug, { proposalId: pending[0].id });
      const [done] = await db.select().from(proposals).where(eq(proposals.id, pending[0].id));
      expect(done.status).not.toBe("pending");
    }
  });

  it("the Studio's data is there for a new project: Git, deploy and services, all empty and safe", async () => {
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const deploy = await getDeployState(access);
    expect(deploy.target.domain).toMatch(/\.saqina\.dev$/);
    expect(deploy.deployments).toEqual([]);
    const services = await getServicesState(access);
    expect(services).toEqual({ services: [], issues: [] });
  });

  it("cannot publish without a repository, then with one but without a database for the preview", async () => {
    await expectCode(publish(owner, slug, deps), "VALIDATION_ERROR");
    await db.insert(repositoryConnections).values({
      projectId,
      provider: "github",
      fullName: "acme/soap-shop",
      status: "connected",
      createdBy: owner.id,
    });
    await saveService(owner, slug, {
      provider: "neon",
      production: { DATABASE_URL: "postgresql://u:p@live.example/main" },
    });
    sent.length = 0;
    await expectCode(publish(owner, slug, deps), "CONFLICT");
    expect(sent).toEqual([]);
  });

  it("publishes to <slug>.saqina.dev once the preview has its own database", async () => {
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    const [service] = (await getServicesState(access)).services;
    await saveService(owner, slug, {
      id: service.id,
      provider: "neon",
      preview: { DATABASE_URL: "postgresql://u:p@branch.example/preview" },
    });
    expect((await getServicesState(access)).issues).toEqual([]);

    sent.length = 0;
    const result = await publish(owner, slug, deps);
    expect(result.domain).toBe(`${slug}.saqina.dev`);
    expect(sent.map((s) => s.call)).toEqual([
      "POST /v11/projects",
      "POST /v10/projects/prj_new/domains",
      "POST /v10/projects/prj_new/env",
      "POST /v13/deployments",
    ]);
    const rows = await db.select().from(deployments).where(eq(deployments.projectId, projectId));
    expect(rows).toHaveLength(1);
    expect((await getDeployState(access)).target.status).toBe("ready");
  });

  it("agents working elsewhere are told about the app's variables, never their values", async () => {
    const md = await agentsMdFor(await loadProjectAccess(owner, { slug }, "project:read"));
    expect(md).toContain("neon (database): DATABASE_URL");
    expect(md).toContain(`acme/soap-shop`);
    expect(md).not.toContain("branch.example");
    expect(md).not.toContain("live.example");
  });

  it("the PRD still says approved and the plan is intact after all of it", async () => {
    const docs = await db.select().from(documents).where(eq(documents.projectId, projectId));
    expect(docs.find((d) => d.slug === "prd")?.status).toBe("approved");
    expect(docs.find((d) => d.slug === "plan")).toBeTruthy();
  });
});
