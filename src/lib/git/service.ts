import "server-only";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { repositoryConnections } from "@/lib/db/schema";
import { GIT_PROVIDERS } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { assertSafeEndpoint } from "@/lib/net/endpoint-guard";
import { revokeCredential, storeCredential, withSecret } from "@/lib/secrets/service";
import { parse } from "@/lib/validation";
import { GIT_ADAPTERS } from "./adapters";
import { localGitAllowed } from "./local";
import { detectStack, MANIFESTS } from "./stack";
import { type GitAdapter, GitError, type RepoRef } from "./types";

export type RepositoryRow = typeof repositoryConnections.$inferSelect;

/** What the browser sees: no credential id, no token. */
export interface RepositoryView {
  provider: RepositoryRow["provider"];
  fullName: string;
  defaultBranch: string;
  developmentBranch: string | null;
  agentBranchPrefix: string;
  status: RepositoryRow["status"];
  hasCredential: boolean;
  headSha: string | null;
  detectedStack: Record<string, string>;
  lastSyncedAt: Date | null;
  lastError: string | null;
}

export const toRepositoryView = (r: RepositoryRow): RepositoryView => ({
  provider: r.provider,
  fullName: r.fullName,
  defaultBranch: r.defaultBranch,
  developmentBranch: r.developmentBranch,
  agentBranchPrefix: r.agentBranchPrefix,
  status: r.status,
  hasCredential: Boolean(r.credentialId),
  headSha: r.headSha,
  detectedStack: r.detectedStack,
  lastSyncedAt: r.lastSyncedAt,
  lastError: r.lastError,
});

export async function getRepository(access: ProjectAccess): Promise<RepositoryRow | null> {
  const [row] = await db
    .select()
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, access.project.id));
  return row ?? null;
}

/**
 * Runs an adapter call with the project's token. The token exists only inside this call;
 * project credentials are checked to belong to the same project.
 */
export async function withRepo<T>(
  row: RepositoryRow,
  use: (adapter: GitAdapter, ref: RepoRef, token: string | null) => Promise<T>,
): Promise<T> {
  const adapter = GIT_ADAPTERS[row.provider];
  const ref = { fullName: row.fullName, baseUrl: row.baseUrl };
  if (!row.credentialId) return use(adapter, ref, null);
  return withSecret(row.credentialId, { kind: "git", projectId: row.projectId }, (token) =>
    use(adapter, ref, token),
  );
}

async function refresh(row: RepositoryRow) {
  return withRepo(row, async (adapter, ref, token) => {
    const info = await adapter.getRepository(ref, token);
    // Manifests only: the repository is never mirrored into the database.
    const root = await adapter.listFiles(ref, token, { ref: info.defaultBranch }).catch(() => []);
    const present = MANIFESTS.filter((m) => root.some((f) => f.path === m));
    const files = Object.fromEntries(
      await Promise.all(
        present.map(
          async (m) =>
            [
              m,
              await adapter
                .readFile(ref, token, { path: m, ref: info.defaultBranch })
                .catch(() => ""),
            ] as const,
        ),
      ),
    );
    return { info, detected: detectStack(files) };
  });
}

const connectInput = z.object({
  provider: z.enum(GIT_PROVIDERS),
  fullName: z.string().trim().min(1).max(300),
  baseUrl: z.string().trim().max(300).nullish(),
  token: z.string().trim().max(500).optional(),
  developmentBranch: z.string().trim().max(120).nullish(),
  agentBranchPrefix: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9._-]+\/$/)
    .default("saqina/"),
});

const statusFor = (error: unknown) =>
  error instanceof GitError ? (error.code === "auth_failed" ? "expired" : "error") : "error";

/** Validates the repository with the given token, then stores the connection. */
export async function connectRepository(actor: Actor, slug: string, input: unknown) {
  const data = parse(connectInput, input);
  await loadProjectAccess(actor, { slug }, "project:update");
  if (data.provider === "custom_local") {
    if (!localGitAllowed())
      throw new AppError("VALIDATION_ERROR", "Local git disabled", { provider: "localDisabled" });
    if (!data.fullName.startsWith("/"))
      throw new AppError("VALIDATION_ERROR", "Absolute path", { fullName: "invalid" });
  } else if (!/^[\w.-]+(\/[\w.-]+)+$/.test(data.fullName)) {
    throw new AppError("VALIDATION_ERROR", "owner/name", { fullName: "invalid" });
  }
  if (data.baseUrl) await assertSafeEndpoint(data.baseUrl);

  // Probe before saving anything: a wrong token never gets stored.
  let info: Awaited<ReturnType<GitAdapter["getRepository"]>>;
  try {
    info = await GIT_ADAPTERS[data.provider].getRepository(
      { fullName: data.fullName, baseUrl: data.baseUrl ?? null },
      data.token ?? null,
    );
  } catch (error) {
    throw new AppError("VALIDATION_ERROR", "Repository check failed", {
      fullName: error instanceof GitError ? error.code : "provider_error",
    });
  }

  const batch = new EventBatch();
  await db.transaction(async (tx) => {
    const writer = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const [existing] = await tx
      .select()
      .from(repositoryConnections)
      .where(eq(repositoryConnections.projectId, writer.project.id));
    if (existing?.credentialId) await revokeCredential(tx, existing.credentialId);
    const credentialId = data.token
      ? await storeCredential(tx, {
          scope: "project",
          kind: "git",
          label: `${data.provider}:${data.fullName}`,
          secret: data.token,
          projectId: writer.project.id,
          createdBy: actor.id,
        })
      : null;
    const values = {
      projectId: writer.project.id,
      provider: data.provider,
      fullName: info.fullName,
      externalId: info.externalId,
      baseUrl: data.baseUrl ?? null,
      defaultBranch: info.defaultBranch,
      developmentBranch: data.developmentBranch || null,
      agentBranchPrefix: data.agentBranchPrefix,
      credentialId,
      status: "connected" as const,
      headSha: info.headSha,
      lastError: null,
      lastSyncedAt: new Date(),
      createdBy: actor.id,
    };
    await tx
      .insert(repositoryConnections)
      .values(values)
      .onConflictDoUpdate({ target: repositoryConnections.projectId, set: values });
    await batch.emit(tx, {
      type: "REPOSITORY_CONNECTED",
      projectId: writer.project.id,
      actorId: actor.id,
      entityType: "repository",
      entityId: writer.project.id,
      data: { title: info.fullName, provider: data.provider },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: writer.project.id,
      type: "repository.connected",
      entityType: "repository",
      entityId: writer.project.id,
      metadata: {
        provider: data.provider,
        repository: info.fullName,
        credential: Boolean(credentialId),
      },
    });
  });
  batch.flush();
  // Stack detection reads manifests; a failure here leaves the connection usable.
  await syncRepository(actor, slug).catch(() => null);
}

/** Re-reads repository info and the detected stack; marks the connection on failure. */
export async function syncRepository(actor: Actor, slug: string) {
  const access = await loadProjectAccess(actor, { slug }, "project:read");
  const row = await getRepository(access);
  if (!row || row.status === "disconnected") throw new AppError("NOT_FOUND");
  try {
    const { info, detected } = await refresh(row);
    await db
      .update(repositoryConnections)
      .set({
        status: "connected",
        headSha: info.headSha,
        defaultBranch: info.defaultBranch,
        detectedStack: detected,
        lastError: null,
        lastSyncedAt: new Date(),
      })
      .where(eq(repositoryConnections.id, row.id));
    return { ok: true as const, detected };
  } catch (error) {
    const code = error instanceof GitError ? error.code : "provider_error";
    await db
      .update(repositoryConnections)
      .set({ status: statusFor(error), lastError: code })
      .where(eq(repositoryConnections.id, row.id));
    return { ok: false as const, code };
  }
}

export async function disconnectRepository(actor: Actor, slug: string) {
  const batch = new EventBatch();
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const [row] = await tx
      .select()
      .from(repositoryConnections)
      .where(eq(repositoryConnections.projectId, access.project.id));
    if (!row) throw new AppError("NOT_FOUND");
    if (row.credentialId) await revokeCredential(tx, row.credentialId);
    await tx
      .update(repositoryConnections)
      .set({ status: "disconnected", credentialId: null })
      .where(eq(repositoryConnections.id, row.id));
    await batch.emit(tx, {
      type: "REPOSITORY_DISCONNECTED",
      projectId: access.project.id,
      actorId: actor.id,
      entityType: "repository",
      entityId: access.project.id,
      data: { title: row.fullName },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "repository.disconnected",
      entityType: "repository",
      entityId: access.project.id,
      metadata: { repository: row.fullName },
    });
  });
  batch.flush();
}

/** Branch guard: agents only ever write to branches under the configured prefix. */
export function assertWritableBranch(row: RepositoryRow, branch: string) {
  const protectedBranches = [row.defaultBranch, row.developmentBranch].filter(Boolean);
  if (
    protectedBranches.includes(branch) ||
    !branch.startsWith(row.agentBranchPrefix) ||
    branch.length <= row.agentBranchPrefix.length
  )
    throw new AppError("AUTHORIZATION_ERROR", "Protected branch", { branch: "protected" });
}
