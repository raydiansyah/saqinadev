import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";

/**
 * A small Vercel REST client (no SDK). The token is passed in for one call and never logged;
 * error bodies are never surfaced, only a code.
 */

export interface VercelContext {
  token: string;
  /** The team that owns the project; null for a personal account. */
  teamId: string | null;
  fetcher?: typeof fetch;
}

export type VercelErrorCode = "auth_failed" | "not_found" | "conflict" | "rate_limited" | "failed";

export class VercelError extends Error {
  constructor(readonly code: VercelErrorCode) {
    super(code);
    this.name = "VercelError";
  }
}

const BASE = "https://api.vercel.com";

const codeFor = (status: number): VercelErrorCode =>
  status === 401 || status === 403
    ? "auth_failed"
    : status === 404
      ? "not_found"
      : status === 409
        ? "conflict"
        : status === 429
          ? "rate_limited"
          : "failed";

async function call<T>(
  ctx: VercelContext,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const url = new URL(path, BASE);
  if (ctx.teamId) url.searchParams.set("teamId", ctx.teamId);
  let response: Response;
  try {
    response = await (ctx.fetcher ?? fetch)(url, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${ctx.token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new VercelError("failed");
  }
  if (!response.ok) {
    log.warn("vercel.request_failed", { path: path.split("?")[0], status: response.status });
    throw new VercelError(codeFor(response.status));
  }
  return (await response.json().catch(() => ({}))) as T;
}

/** The Vercel project name for a Saqina project: letters, digits and hyphens, at most 100. */
export const vercelNameFor = (slug: string) => `saqina-${slug}`.slice(0, 100);

export interface VercelProject {
  id: string;
  name: string;
}

export async function checkToken(ctx: VercelContext): Promise<void> {
  await call(ctx, "/v2/user");
}

/** Creates the project connected to a GitHub repository, or returns the one that already exists. */
export async function ensureProject(
  ctx: VercelContext,
  input: { name: string; repo: string },
): Promise<VercelProject> {
  try {
    const p = await call<VercelProject>(ctx, "/v11/projects", {
      method: "POST",
      body: { name: input.name, gitRepository: { type: "github", repo: input.repo } },
    });
    return { id: p.id, name: p.name };
  } catch (error) {
    if (!(error instanceof VercelError) || error.code !== "conflict") throw error;
    const p = await call<VercelProject>(ctx, `/v9/projects/${encodeURIComponent(input.name)}`);
    return { id: p.id, name: p.name };
  }
}

/** Adds the domain to the project; already added is fine. */
export async function ensureDomain(ctx: VercelContext, projectId: string, domain: string) {
  try {
    await call(ctx, `/v10/projects/${encodeURIComponent(projectId)}/domains`, {
      method: "POST",
      body: { name: domain },
    });
  } catch (error) {
    if (error instanceof VercelError && error.code === "conflict") return;
    throw error;
  }
}

export interface VercelDeployment {
  id: string;
  url: string | null;
  state: "pending" | "success" | "failure" | "inactive";
  environment: "production" | "preview";
  sha: string | null;
  createdAt: number | null;
}

const STATES: Record<string, VercelDeployment["state"]> = {
  READY: "success",
  ERROR: "failure",
  CANCELED: "inactive",
  BUILDING: "pending",
  QUEUED: "pending",
  INITIALIZING: "pending",
};

interface RawDeployment {
  uid?: string;
  id?: string;
  url?: string;
  state?: string;
  readyState?: string;
  target?: string | null;
  meta?: Record<string, string>;
  created?: number;
  createdAt?: number;
}

const toDeployment = (d: RawDeployment): VercelDeployment | null => {
  const id = d.uid ?? d.id;
  if (!id) return null;
  return {
    id,
    url: d.url ? `https://${d.url}` : null,
    state: STATES[d.state ?? d.readyState ?? ""] ?? "pending",
    environment: d.target === "production" ? "production" : "preview",
    sha: d.meta?.githubCommitSha ?? null,
    createdAt: d.created ?? d.createdAt ?? null,
  };
};

export async function listDeployments(
  ctx: VercelContext,
  projectId: string,
  limit = 20,
): Promise<VercelDeployment[]> {
  const r = await call<{ deployments?: RawDeployment[] }>(
    ctx,
    `/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=${limit}`,
  );
  return (r.deployments ?? []).flatMap((d) => toDeployment(d) ?? []);
}

/** Starts a production deployment of the repository's branch. */
export async function createDeployment(
  ctx: VercelContext,
  input: { name: string; projectId: string; repo: string; ref: string },
): Promise<VercelDeployment> {
  const [org, repo] = input.repo.split("/");
  if (!org || !repo)
    throw new AppError("VALIDATION_ERROR", "owner/name", { repository: "invalid" });
  const r = await call<RawDeployment>(ctx, "/v13/deployments", {
    method: "POST",
    body: {
      name: input.name,
      project: input.projectId,
      target: "production",
      gitSource: { type: "github", org, repo, ref: input.ref },
    },
  });
  const d = toDeployment({ ...r, target: "production" });
  if (!d) throw new VercelError("failed");
  return d;
}
