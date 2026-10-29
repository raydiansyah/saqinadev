import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documentLinks, repositoryConnections, webhookDeliveries } from "@/lib/db/schema";
import { applyGitEvent } from "@/lib/git/events/apply";
import { parseGitEvent } from "@/lib/git/events/parse";
import { log } from "@/lib/log";
import { allow } from "@/lib/rate-limit";
import { withSecret } from "@/lib/secrets/service";
import { cleanDocsPath, DEFAULT_DOCS_PATH } from "./paths";

/** GitHub signs the raw body only (X-Hub-Signature-256: sha256=<hex>), with no timestamp. */
export function verifyGithubSignature(
  body: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", secret).update(body).digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status });
const MAX_BODY = 5_000_000;

interface PushPayload {
  ref?: string;
  commits?: { added?: string[]; modified?: string[]; removed?: string[] }[];
}

/** Does the push touch the docs folder or a file one of our documents is linked to? */
export function touchesDocs(payload: PushPayload, docsPath: string, linked: Set<string>): boolean {
  const commits = payload.commits ?? [];
  // GitHub lists at most 20 commits; with no list we cannot rule anything out.
  if (commits.length === 0 || commits.length >= 20) return true;
  return commits.some((c) =>
    [...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? [])].some(
      (p) => p.startsWith(`${docsPath}/`) || linked.has(p),
    ),
  );
}

export interface WebhookDeps {
  /** Runs the sync after the response is sent. */
  schedule: (projectId: string) => void;
}

/**
 * Receives GitHub push events for a connected repository. Order of checks: id shape, rate
 * limit, body size, signature, replay by delivery id, then only pushes to the base branch that
 * touch documents start a sync. Everything else is acknowledged and ignored.
 */
export async function handleGithubWebhook(
  request: Request,
  connectionId: string,
  deps: WebhookDeps,
): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return reply(404, { ok: false });
  if (!(await allow(`webhook:${connectionId}`, 60, 60_000))) return reply(429, { ok: false });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return reply(413, { ok: false });
  const body = await request.text();
  if (body.length > MAX_BODY) return reply(413, { ok: false });

  const [connection] = await db
    .select()
    .from(repositoryConnections)
    .where(eq(repositoryConnections.id, connectionId));
  // The hook serves two jobs: repository events (always) and document sync (when switched on).
  if (!connection?.webhookCredentialId) return reply(404, { ok: false });

  const signature = request.headers.get("x-hub-signature-256");
  const valid = await withSecret(
    connection.webhookCredentialId,
    { kind: "git_webhook", projectId: connection.projectId },
    async (secret) => verifyGithubSignature(body, signature, secret),
  ).catch(() => false);
  if (!valid) {
    log.warn("docsync.webhook_rejected", { connectionId });
    return reply(401, { ok: false });
  }

  const event = request.headers.get("x-github-event");
  if (event === "ping") return reply(200, { ok: true, pong: true });
  const handled = ["push", "pull_request", "check_suite", "workflow_run", "deployment_status"];
  if (!event || !handled.includes(event)) return reply(200, { ok: true, ignored: event });

  const delivery = request.headers.get("x-github-delivery");
  if (delivery) {
    const fresh = await db
      .insert(webhookDeliveries)
      .values({ id: delivery })
      .onConflictDoNothing()
      .returning({ id: webhookDeliveries.id });
    if (fresh.length === 0) return reply(200, { ok: true, duplicate: true });
  }

  let payload: PushPayload;
  try {
    payload = JSON.parse(body) as PushPayload;
  } catch {
    return reply(400, { ok: false });
  }

  // Tasks, CI, deployments and the code graph follow every event.
  const parsed = parseGitEvent(event, payload);
  let applied: { moved: number; linked: number } | null = null;
  if (parsed) {
    try {
      applied = await applyGitEvent(connection, parsed);
    } catch (error) {
      // Recording must never make GitHub retry forever; the daily sweep catches up.
      log.error("git.event_failed", { event, error: String(error) });
    }
  }
  if (event !== "push" || !connection.docSyncEnabled)
    return reply(200, { ok: true, event, ...(applied ?? {}) });

  const base = connection.developmentBranch ?? connection.defaultBranch;
  if (payload.ref !== `refs/heads/${base}`)
    return reply(200, { ok: true, ignored: "branch", ...(applied ?? {}) });

  const links = await db
    .select({ path: documentLinks.path })
    .from(documentLinks)
    .where(and(eq(documentLinks.projectId, connection.projectId)));
  const docsPath = cleanDocsPath(connection.docsPath) ?? DEFAULT_DOCS_PATH;
  if (!touchesDocs(payload, docsPath, new Set(links.map((l) => l.path))))
    return reply(200, { ok: true, ignored: "no_docs", ...(applied ?? {}) });

  deps.schedule(connection.projectId);
  return reply(202, { ok: true, queued: true, ...(applied ?? {}) });
}
