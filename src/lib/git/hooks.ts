import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { repositoryConnections } from "@/lib/db/schema";
import { siteBase } from "@/lib/email/layout";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { revokeCredential, storeCredential } from "@/lib/secrets/service";
import { installGithubHook } from "./github";
import { withRepo } from "./service";
import { GitError } from "./types";

export interface RepositoryEventsResult {
  /** True when Saqina registered the webhook itself. */
  installed: boolean;
  webhookUrl: string;
  /** Only when the hook could not be installed: paste it into GitHub (shown once). */
  webhookSecret?: string;
  /** Why the automatic install did not work, as a code the UI translates. */
  reason?: "no_admin" | "unsupported" | "failed";
}

/**
 * Connects the repository to Saqina's events: push, pull requests, CI and deployments. The hook
 * is installed with the project's own token; a token without admin rights on the repository
 * falls back to the manual setup (URL and secret). The secret is new on every call and is stored
 * encrypted; it is returned only when the person has to paste it.
 */
export async function enableRepositoryEvents(
  actor: Actor,
  slug: string,
  options: { install?: typeof installGithubHook } = {},
): Promise<RepositoryEventsResult> {
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  const [row] = await db
    .select()
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, access.project.id));
  if (!row || row.status === "disconnected") throw new AppError("NOT_FOUND");
  const webhookUrl = `${siteBase()}/api/git/webhook/${row.id}`;
  if (row.provider !== "github") return { installed: false, webhookUrl, reason: "unsupported" };

  const secret = randomBytes(32).toString("hex");
  const credentialId = await db.transaction(async (tx) => {
    if (row.webhookCredentialId) await revokeCredential(tx, row.webhookCredentialId);
    const id = await storeCredential(tx, {
      scope: "project",
      kind: "git_webhook",
      label: `webhook:${row.fullName}`,
      secret,
      projectId: access.project.id,
      createdBy: actor.id,
    });
    await tx
      .update(repositoryConnections)
      .set({ webhookCredentialId: id })
      .where(eq(repositoryConnections.id, row.id));
    return id;
  });

  let installed = false;
  let reason: RepositoryEventsResult["reason"];
  try {
    await withRepo(row, (_adapter, ref, token) =>
      (options.install ?? installGithubHook)(ref, token, { url: webhookUrl, secret }),
    );
    installed = true;
  } catch (error) {
    reason =
      error instanceof GitError && (error.code === "auth_failed" || error.code === "not_found")
        ? "no_admin"
        : "failed";
    log.warn("git.hook_install_failed", {
      reason,
      code: error instanceof GitError ? error.code : "error",
    });
  }
  await recordAudit(db, {
    actorId: actor.id,
    scope: "project",
    projectId: access.project.id,
    type: "repository.events_enabled",
    entityType: "repository",
    entityId: row.id,
    metadata: { repository: row.fullName, installed, credentialId },
  });
  return installed
    ? { installed, webhookUrl }
    : { installed, webhookUrl, webhookSecret: secret, reason };
}
