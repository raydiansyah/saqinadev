import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { deployments, deployTargets, repositoryConnections } from "@/lib/db/schema";
import { DEPLOY_OWNERS } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { allow } from "@/lib/rate-limit";
import { revokeCredential, storeCredential, withSecret } from "@/lib/secrets/service";
import { previewIssues } from "@/lib/services/preview-ready";
import { envForDeploy, loadServiceValues, recordServicesSynced } from "@/lib/services/service";
import { parse } from "@/lib/validation";
import {
  checkToken,
  createDeployment,
  ensureDomain,
  ensureProject,
  listDeployments,
  upsertEnv,
  type VercelContext,
  VercelError,
  vercelNameFor,
} from "./vercel";

/**
 * Publishing: by default to Saqina's own Vercel team at `<slug>.saqina.dev`, or to the client's
 * own Vercel account. Saqina's token comes from the environment; a client's token is stored
 * encrypted for that project only and is never used for any other project.
 */

type Fetcher = typeof fetch;
export interface DeployDeps {
  fetcher?: Fetcher;
  env?: Record<string, string | undefined>;
}

export const projectsDomain = (env: Record<string, string | undefined> = process.env) =>
  (env.SAQINA_PROJECTS_DOMAIN || "saqina.dev").toLowerCase();

export function saqinaVercelConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(env.VERCEL_TOKEN?.trim());
}

const DOMAIN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export interface DeployTargetView {
  owner: "saqina" | "client";
  domain: string | null;
  status: "pending" | "ready" | "error";
  lastError: string | null;
  lastDeployedAt: Date | null;
  hasClientToken: boolean;
  /** Whether Saqina's own Vercel team is set up on this server. */
  saqinaAvailable: boolean;
  defaultDomain: string;
  repository: string | null;
}

export interface DeploymentView {
  id: string;
  provider: string;
  environment: "production" | "preview";
  state: "pending" | "success" | "failure" | "inactive";
  url: string | null;
  sha: string | null;
  updatedAt: Date;
}

async function repositoryFor(projectId: string) {
  const [row] = await db
    .select()
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, projectId));
  return row && row.status !== "disconnected" && row.provider === "github" ? row : null;
}

export async function getDeployState(
  access: ProjectAccess,
  deps: DeployDeps = {},
): Promise<{ target: DeployTargetView; deployments: DeploymentView[] }> {
  const env = deps.env ?? process.env;
  const [target] = await db
    .select()
    .from(deployTargets)
    .where(eq(deployTargets.projectId, access.project.id));
  const repo = await repositoryFor(access.project.id);
  const rows = await db
    .select()
    .from(deployments)
    .where(eq(deployments.projectId, access.project.id))
    .orderBy(desc(deployments.updatedAt))
    .limit(20);
  const defaultDomain = `${access.project.slug}.${projectsDomain(env)}`;
  return {
    target: {
      owner: target?.owner ?? "saqina",
      domain: target?.domain ?? defaultDomain,
      status: target?.status ?? "pending",
      lastError: target?.lastError ?? null,
      lastDeployedAt: target?.lastDeployedAt ?? null,
      hasClientToken: Boolean(target?.credentialId),
      saqinaAvailable: saqinaVercelConfigured(env),
      defaultDomain,
      repository: repo?.fullName ?? null,
    },
    deployments: rows.map((d) => ({
      id: d.id,
      provider: d.provider,
      environment: d.environment,
      state: d.state,
      url: d.url,
      sha: d.sha,
      updatedAt: d.updatedAt,
    })),
  };
}

const setupInput = z.object({
  owner: z.enum(DEPLOY_OWNERS),
  /** The client's Vercel token; write-only. Empty keeps the stored one. */
  token: z.string().trim().max(500).optional(),
  teamId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .nullish(),
  /** A custom domain (client's own Vercel only). */
  domain: z.string().trim().toLowerCase().max(253).nullish(),
});

/** Chooses where the project is published. Saves nothing at Vercel yet; Publish does that. */
export async function setupDeployTarget(
  actor: Actor,
  slug: string,
  raw: unknown,
  deps: DeployDeps = {},
) {
  const data = parse(setupInput, raw);
  const env = deps.env ?? process.env;
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  const projectId = access.project.id;
  const defaultDomain = `${access.project.slug}.${projectsDomain(env)}`;

  if (data.owner === "saqina" && !saqinaVercelConfigured(env))
    throw new AppError("VALIDATION_ERROR", "Saqina Vercel not configured", {
      deploy: "notConfigured",
    });
  if (data.domain && !DOMAIN.test(data.domain))
    throw new AppError("VALIDATION_ERROR", "Invalid domain", { domain: "invalid" });
  if (data.owner === "saqina" && data.domain && data.domain !== defaultDomain)
    throw new AppError("VALIDATION_ERROR", "Custom domains need your own Vercel", {
      domain: "ownVercel",
    });

  const [current] = await db
    .select()
    .from(deployTargets)
    .where(eq(deployTargets.projectId, projectId));
  if (data.owner === "client" && !data.token && !current?.credentialId)
    throw new AppError("VALIDATION_ERROR", "Token required", { token: "required" });
  if (data.token) {
    // A wrong token is refused before anything is stored.
    try {
      await checkToken({ token: data.token, teamId: data.teamId ?? null, fetcher: deps.fetcher });
    } catch (error) {
      throw new AppError("VALIDATION_ERROR", "Token refused", {
        token:
          error instanceof VercelError && error.code === "auth_failed" ? "refused" : "unreachable",
      });
    }
  }
  const domain = data.owner === "saqina" ? defaultDomain : (data.domain ?? current?.domain ?? null);

  await db.transaction(async (tx) => {
    let credentialId = current?.credentialId ?? null;
    if (data.owner === "saqina") {
      if (credentialId) await revokeCredential(tx, credentialId);
      credentialId = null;
    } else if (data.token) {
      if (credentialId) await revokeCredential(tx, credentialId);
      credentialId = await storeCredential(tx, {
        scope: "project",
        kind: "deploy",
        label: `vercel:${access.project.slug}`,
        secret: data.token,
        projectId,
        createdBy: actor.id,
      });
    }
    // Moving to another Vercel account starts from a new Vercel project.
    const moved = current && (current.owner !== data.owner || data.token);
    await tx
      .insert(deployTargets)
      .values({
        projectId,
        owner: data.owner,
        credentialId,
        teamId: data.owner === "client" ? (data.teamId ?? null) : null,
        domain,
      })
      .onConflictDoUpdate({
        target: deployTargets.projectId,
        set: {
          owner: data.owner,
          credentialId,
          teamId: data.owner === "client" ? (data.teamId ?? null) : null,
          domain,
          status: "pending",
          lastError: null,
          ...(moved ? { vercelProjectId: null } : {}),
        },
      });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId,
      type: "deploy.target_set",
      entityType: "project",
      entityId: projectId,
      metadata: { owner: data.owner, domain, token: Boolean(data.token) },
    });
  });
}

/** Runs `use` with the token that belongs to this project's target; it never leaves the call. */
async function withVercel<T>(
  target: typeof deployTargets.$inferSelect,
  deps: DeployDeps,
  use: (ctx: VercelContext) => Promise<T>,
): Promise<T> {
  const env = deps.env ?? process.env;
  if (target.owner === "client") {
    if (!target.credentialId)
      throw new AppError("VALIDATION_ERROR", "Token required", { token: "required" });
    return withSecret(
      target.credentialId,
      { kind: "deploy", projectId: target.projectId },
      (token) => use({ token, teamId: target.teamId, fetcher: deps.fetcher }),
    );
  }
  const token = env.VERCEL_TOKEN?.trim();
  if (!token)
    throw new AppError("VALIDATION_ERROR", "Saqina Vercel not configured", {
      deploy: "notConfigured",
    });
  return use({ token, teamId: env.VERCEL_TEAM_ID?.trim() || null, fetcher: deps.fetcher });
}

const errorKey = (error: unknown) =>
  error instanceof VercelError
    ? error.code === "auth_failed"
      ? "vercelAuth"
      : error.code === "rate_limited"
        ? "vercelBusy"
        : "vercelFailed"
    : "vercelFailed";

/**
 * Publishes: makes sure the Vercel project (connected to the repository) and the domain exist,
 * then starts a production deployment of the repository's branch. A person starts it; the status
 * comes back through the repository's deployment events and `refreshDeployments`.
 */
export async function publish(actor: Actor, slug: string, deps: DeployDeps = {}) {
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  const projectId = access.project.id;
  const repo = await repositoryFor(projectId);
  if (!repo)
    throw new AppError("VALIDATION_ERROR", "Connect a GitHub repository first", {
      deploy: "noRepository",
    });
  // An app that uses a database or sign-in service is only published (and previewed) once the
  // preview has values of its own, so a preview never touches production data.
  const services = await loadServiceValues(projectId);
  if (previewIssues(services).length > 0)
    throw new AppError("CONFLICT", "Services not ready to preview", {
      services: "previewNotReady",
    });
  if (!(await allow(`publish:${projectId}`, 10, 60 * 60_000))) throw new AppError("RATE_LIMIT");

  let [target] = await db
    .select()
    .from(deployTargets)
    .where(eq(deployTargets.projectId, projectId));
  if (!target) {
    await setupDeployTarget(actor, slug, { owner: "saqina" }, deps);
    [target] = await db.select().from(deployTargets).where(eq(deployTargets.projectId, projectId));
  }
  try {
    const result = await withVercel(target, deps, async (ctx) => {
      const name = vercelNameFor(access.project.slug);
      const project = await ensureProject(ctx, { name, repo: repo.fullName });
      if (target.domain) await ensureDomain(ctx, project.id, target.domain);
      // The user's own database and sign-in keys reach the deployment here and nowhere else.
      await upsertEnv(ctx, project.id, envForDeploy(services));
      const deployment = await createDeployment(ctx, {
        name,
        projectId: project.id,
        repo: repo.fullName,
        ref: repo.defaultBranch,
      });
      return { project, deployment };
    });
    await db.transaction(async (tx) => {
      await tx
        .update(deployTargets)
        .set({
          vercelProjectId: result.project.id,
          status: "ready",
          lastError: null,
          lastDeployedAt: new Date(),
        })
        .where(eq(deployTargets.id, target.id));
      await tx
        .insert(deployments)
        .values({
          projectId,
          provider: "vercel",
          externalId: result.deployment.id,
          environment: "production",
          state: result.deployment.state,
          url: result.deployment.url,
          sha: result.deployment.sha,
        })
        .onConflictDoUpdate({
          target: [deployments.projectId, deployments.provider, deployments.externalId],
          set: { state: result.deployment.state, url: result.deployment.url },
        });
      await recordAudit(tx, {
        actorId: actor.id,
        scope: "project",
        projectId,
        type: "deploy.published",
        entityType: "project",
        entityId: projectId,
        metadata: { owner: target.owner, domain: target.domain },
      });
    });
    if (services.length > 0) await recordServicesSynced(projectId, null);
    return { domain: target.domain, url: result.deployment.url };
  } catch (error) {
    const key = errorKey(error);
    await db
      .update(deployTargets)
      .set({ status: "error", lastError: key })
      .where(eq(deployTargets.id, target.id));
    if (error instanceof AppError) throw error;
    throw new AppError("VALIDATION_ERROR", "Publish failed", { deploy: key });
  }
}

/**
 * After a service changes: if the project already has a Vercel project, pushes the new values so
 * the next preview uses them. Best effort; Publish sends them again.
 */
export async function syncServiceEnv(projectId: string, deps: DeployDeps = {}): Promise<void> {
  const [target] = await db
    .select()
    .from(deployTargets)
    .where(eq(deployTargets.projectId, projectId));
  if (!target?.vercelProjectId) return;
  const services = await loadServiceValues(projectId);
  if (previewIssues(services).length > 0) return;
  try {
    await withVercel(target, deps, (ctx) =>
      upsertEnv(ctx, target.vercelProjectId as string, envForDeploy(services)),
    );
    await recordServicesSynced(projectId, null);
  } catch (error) {
    await recordServicesSynced(projectId, errorKey(error));
  }
}

/** Brings the stored deployments up to date from Vercel; cheap enough to call when a tab opens. */
export async function refreshDeployments(access: ProjectAccess, deps: DeployDeps = {}) {
  const projectId = access.project.id;
  const [target] = await db
    .select()
    .from(deployTargets)
    .where(eq(deployTargets.projectId, projectId));
  if (!target?.vercelProjectId) return 0;
  if (!(await allow(`deploy-refresh:${projectId}`, 6, 60_000))) return 0;
  try {
    const list = await withVercel(target, deps, (ctx) =>
      listDeployments(ctx, target.vercelProjectId as string),
    );
    for (const d of list)
      await db
        .insert(deployments)
        .values({
          projectId,
          provider: "vercel",
          externalId: d.id,
          environment: d.environment,
          state: d.state,
          url: d.url,
          sha: d.sha,
        })
        .onConflictDoUpdate({
          target: [deployments.projectId, deployments.provider, deployments.externalId],
          set: { state: d.state, url: d.url },
        });
    return list.length;
  } catch {
    return 0;
  }
}

/** Forgets the target and revokes a client's stored token. The Vercel project itself stays. */
export async function removeDeployTarget(actor: Actor, slug: string) {
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(deployTargets)
      .where(and(eq(deployTargets.projectId, access.project.id)));
    if (!row) return;
    if (row.credentialId) await revokeCredential(tx, row.credentialId);
    await tx.delete(deployTargets).where(eq(deployTargets.id, row.id));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "deploy.target_removed",
      entityType: "project",
      entityId: access.project.id,
    });
  });
}
