import "server-only";
import { randomBytes } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { documentLinks, projectSyncRequests, repositoryConnections } from "@/lib/db/schema";
import { siteBase } from "@/lib/email/layout";
import { AppError } from "@/lib/errors";
import { allow } from "@/lib/rate-limit";
import { revokeCredential, storeCredential } from "@/lib/secrets/service";
import { parse } from "@/lib/validation";
import { type SyncOptions, type SyncSummary, syncProject } from "./engine";
import { cleanDocsPath, DEFAULT_DOCS_PATH } from "./paths";

const configInput = z.object({
  enabled: z.boolean(),
  docsPath: z.string().trim().max(100).optional(),
  /** Issue a new webhook secret even when one exists. */
  rotateSecret: z.boolean().default(false),
});

export interface DocSyncConfigResult {
  webhookUrl: string;
  /** Shown exactly once, when a secret was just created. Paste it into the GitHub webhook. */
  webhookSecret?: string;
}

async function connectionFor(projectId: string) {
  const [row] = await db
    .select()
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, projectId));
  if (!row || row.status === "disconnected") throw new AppError("NOT_FOUND");
  return row;
}

/** Switches two-way document sync on or off for the project's connected repository. */
export async function configureDocSync(
  actor: Actor,
  slug: string,
  input: unknown,
): Promise<DocSyncConfigResult> {
  const data = parse(configInput, input);
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  const projectId = access.project.id;
  const row = await connectionFor(projectId);
  if (row.provider !== "github")
    throw new AppError("VALIDATION_ERROR", "Sync needs GitHub", { repository: "unsupported" });

  const docsPath = data.docsPath
    ? cleanDocsPath(data.docsPath)
    : (cleanDocsPath(row.docsPath) ?? DEFAULT_DOCS_PATH);
  if (!docsPath) throw new AppError("VALIDATION_ERROR", "Invalid folder", { docsPath: "invalid" });

  const webhookUrl = `${siteBase()}/api/git/webhook/${row.id}`;
  let webhookSecret: string | undefined;

  await db.transaction(async (tx) => {
    if (!data.enabled) {
      if (row.webhookCredentialId) await revokeCredential(tx, row.webhookCredentialId);
      await tx
        .update(repositoryConnections)
        .set({ docSyncEnabled: false, webhookCredentialId: null })
        .where(eq(repositoryConnections.id, row.id));
    } else {
      let credentialId = row.webhookCredentialId;
      if (!credentialId || data.rotateSecret) {
        if (credentialId) await revokeCredential(tx, credentialId);
        webhookSecret = randomBytes(32).toString("hex");
        credentialId = await storeCredential(tx, {
          scope: "project",
          kind: "git_webhook",
          label: `webhook:${row.fullName}`,
          secret: webhookSecret,
          projectId,
          createdBy: actor.id,
        });
      }
      await tx
        .update(repositoryConnections)
        .set({
          docSyncEnabled: true,
          docsPath,
          webhookCredentialId: credentialId,
          docsSyncError: null,
          // The person who switches sync on is the author of the versions it saves.
          createdBy: row.createdBy ?? actor.id,
        })
        .where(eq(repositoryConnections.id, row.id));
      // A first run picks up whatever already differs.
      await tx
        .insert(projectSyncRequests)
        .values({ projectId })
        .onConflictDoUpdate({ target: projectSyncRequests.projectId, set: { attempts: 0 } });
    }
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId,
      type: data.enabled ? "docsync.enabled" : "docsync.disabled",
      entityType: "repository",
      entityId: row.id,
      metadata: { repository: row.fullName, docsPath, rotated: Boolean(webhookSecret) },
    });
  });
  return { webhookUrl, webhookSecret };
}

/** The Sync now button: runs a full sync in the request and reports what happened. */
export async function syncNow(
  actor: Actor,
  slug: string,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  if (!(await allow(`docsync:${actor.id}`, 10, 5 * 60 * 1000))) throw new AppError("RATE_LIMIT");
  const summary = await syncProject(access.project.id, options);
  if (summary.skipped === "disabled") throw new AppError("NOT_FOUND");
  return summary;
}

export interface DocSyncStatus {
  enabled: boolean;
  provider: string;
  docsPath: string;
  webhookUrl: string;
  syncedAt: Date | null;
  error: string | null;
  prUrl: string | null;
  pending: number;
  conflicts: number;
}

/** What the integrations card shows; null when no repository is connected. */
export async function getDocSyncStatus(projectId: string): Promise<DocSyncStatus | null> {
  const [row] = await db
    .select()
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, projectId));
  if (!row || row.status === "disconnected") return null;
  const states = await db
    .select({ state: documentLinks.state, n: count() })
    .from(documentLinks)
    .where(and(eq(documentLinks.projectId, projectId)))
    .groupBy(documentLinks.state);
  const n = (state: string) => Number(states.find((s) => s.state === state)?.n ?? 0);
  return {
    enabled: row.docSyncEnabled,
    provider: row.provider,
    docsPath: row.docsPath,
    webhookUrl: `${siteBase()}/api/git/webhook/${row.id}`,
    syncedAt: row.docsSyncedAt,
    error: row.docsSyncError,
    prUrl: row.docsPrUrl,
    pending: n("pending_pr"),
    conflicts: n("conflict"),
  };
}

/** Per-document sync state for the documents list. */
export async function listDocLinkStates(projectId: string) {
  return db
    .select({
      documentId: documentLinks.documentId,
      state: documentLinks.state,
      path: documentLinks.path,
    })
    .from(documentLinks)
    .where(eq(documentLinks.projectId, projectId));
}

/** The repository's side of a conflict, for the compare dialog. */
export async function getConflictRemote(actor: Actor, slug: string, documentId: string) {
  const access = await loadProjectAccess(actor, { slug }, "project:read");
  const [link] = await db
    .select()
    .from(documentLinks)
    .where(
      and(eq(documentLinks.documentId, documentId), eq(documentLinks.projectId, access.project.id)),
    );
  if (!link || link.state !== "conflict") throw new AppError("NOT_FOUND");
  return { path: link.path, remote: link.conflictRemote ?? "" };
}
