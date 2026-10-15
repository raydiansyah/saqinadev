import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import {
  documentLinks,
  documents,
  projectSyncRequests,
  projects,
  repositoryConnections,
  users,
} from "@/lib/db/schema";
import { insertSyncedDocumentTx, saveDocumentTx } from "@/lib/documents/service";
import type { DocLinkState } from "@/lib/domain/enums";
import { AppError, isAppError } from "@/lib/errors";
import { githubAdapter } from "@/lib/git/github";
import { assertWritableBranch } from "@/lib/git/service";
import { GitError, type SyncAdapter } from "@/lib/git/types";
import { log } from "@/lib/log";
import { notifyTx, teamRecipients } from "@/lib/notifications/service";
import { withSecret } from "@/lib/secrets/service";
import { decide } from "./decide";
import { hashContent, normalizeContent } from "./hash";
import {
  cleanDocsPath,
  DEFAULT_DOCS_PATH,
  docSlug,
  isSyncType,
  parseProvenance,
  pathForDocument,
  stripProvenance,
  syncableFiles,
} from "./paths";

/**
 * Two-way document sync between a project and its GitHub repository.
 *
 * Saqina -> repo: changed documents go to ONE dedicated branch (`<prefix>docs-sync`) with one
 * pull request into the base branch; the base branch is never written directly.
 * Repo -> Saqina: the base branch is read; a changed file becomes a new document version.
 * A change on both sides is never merged or overwritten: the document is marked conflicted and
 * both texts are kept until a person chooses.
 */

export interface SyncSummary {
  pushed: number;
  pulled: number;
  adopted: number;
  created: number;
  conflicts: number;
  missing: number;
  merged: number;
  prUrl: string | null;
  /** Why nothing ran: sync is off, another run holds the lock, or the host cannot sync. */
  skipped?: "disabled" | "busy" | "unsupported" | "clean";
  error?: string;
}

const emptySummary = (): SyncSummary => ({
  pushed: 0,
  pulled: 0,
  adopted: 0,
  created: 0,
  conflicts: 0,
  missing: 0,
  merged: 0,
  prUrl: null,
});

export interface SyncOptions {
  /** Tests inject an in-memory host. */
  adapter?: SyncAdapter;
  /** Do nothing unless a document changed since the last run (scheduled runs after a save). */
  onlyIfDirty?: boolean;
}

type Connection = typeof repositoryConnections.$inferSelect;
type DocRow = typeof documents.$inferSelect;
type LinkRow = typeof documentLinks.$inferSelect;

const READ_BATCH = 8;
const BRANCH_NAME = "docs-sync";

/** Runs one sync, then once more if people kept editing while it ran (at most twice). */
export async function syncProject(
  projectId: string,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  let summary = await syncOnce(projectId, options);
  for (let pass = 1; pass < 2 && !summary.skipped && !summary.error; pass++) {
    const [flag] = await db
      .select()
      .from(projectSyncRequests)
      .where(eq(projectSyncRequests.projectId, projectId));
    if (!flag) break;
    summary = mergeSummaries(summary, await syncOnce(projectId, options));
  }
  return summary;
}

function mergeSummaries(a: SyncSummary, b: SyncSummary): SyncSummary {
  return {
    ...b,
    pushed: a.pushed + b.pushed,
    pulled: a.pulled + b.pulled,
    adopted: a.adopted + b.adopted,
    created: a.created + b.created,
    conflicts: Math.max(a.conflicts, b.conflicts),
    missing: Math.max(a.missing, b.missing),
    merged: a.merged + b.merged,
    prUrl: b.prUrl ?? a.prUrl,
  };
}

async function syncOnce(projectId: string, options: SyncOptions): Promise<SyncSummary> {
  const [connection] = await db
    .select()
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, projectId));
  if (!connection || !connection.docSyncEnabled || connection.status === "disconnected")
    return { ...emptySummary(), skipped: "disabled" };
  if (connection.provider !== "github" && !options.adapter)
    return { ...emptySummary(), skipped: "unsupported" };
  if (options.onlyIfDirty) {
    const [flag] = await db
      .select({ id: projectSyncRequests.projectId })
      .from(projectSyncRequests)
      .where(eq(projectSyncRequests.projectId, projectId));
    if (!flag) return { ...emptySummary(), skipped: "clean" };
  }

  // The database clock, as the driver returns it (a string): only ever handed back to SQL.
  const [{ startedAt }] = (await db.execute(sql`select now() as "startedAt"`)).rows as {
    startedAt: string | Date;
  }[];

  const outcome = await db.transaction(async (lock) => {
    // Held for the whole run: a second run (webhook plus a click) skips instead of racing.
    // An advisory lock, not a row lock: the run itself updates the connection row.
    const [{ ok }] = (
      await lock.execute(
        sql`select pg_try_advisory_xact_lock(hashtextextended(${`docsync:${projectId}`}, 0)) as ok`,
      )
    ).rows as { ok: boolean }[];
    if (!ok) return { ...emptySummary(), skipped: "busy" as const };

    const summary = emptySummary();
    try {
      await runLocked(connection, options.adapter ?? githubAdapter, summary);
      await lock
        .update(repositoryConnections)
        .set({ docsSyncedAt: new Date(), docsSyncError: null })
        .where(eq(repositoryConnections.id, connection.id));
      // Edits made while we ran are newer than `startedAt` and stay flagged.
      await lock
        .delete(projectSyncRequests)
        .where(
          and(
            eq(projectSyncRequests.projectId, projectId),
            sql`${projectSyncRequests.requestedAt} <= ${String(startedAt instanceof Date ? startedAt.toISOString() : startedAt)}::timestamptz`,
          ),
        );
    } catch (error) {
      const code =
        error instanceof GitError ? error.code : isAppError(error) ? error.code : "provider_error";
      log.warn("docsync.failed", { projectId, code, error: String(error) });
      await lock
        .update(repositoryConnections)
        .set({ docsSyncError: code })
        .where(eq(repositoryConnections.id, connection.id));
      await lock
        .insert(projectSyncRequests)
        .values({ projectId, attempts: 1, lastError: code })
        .onConflictDoUpdate({
          target: projectSyncRequests.projectId,
          set: { attempts: sql`${projectSyncRequests.attempts} + 1`, lastError: code },
        });
      summary.error = code;
    }
    return summary;
  });
  return outcome;
}

async function actorFor(connection: Connection): Promise<Actor | null> {
  if (!connection.createdBy) return null;
  const [u] = await db.select().from(users).where(eq(users.id, connection.createdBy));
  return u ? { id: u.id, name: u.name, email: u.email, image: u.image ?? null } : null;
}

async function upsertLink(
  executor: Tx | typeof db,
  link: {
    projectId: string;
    documentId: string;
    path: string;
    remoteHash: string | null;
    pushedHash: string | null;
    state: DocLinkState;
    conflictRemote?: string | null;
  },
) {
  const values = { ...link, conflictRemote: link.conflictRemote ?? null, lastSyncedAt: new Date() };
  await executor
    .insert(documentLinks)
    .values(values)
    .onConflictDoUpdate({ target: documentLinks.documentId, set: values });
}

/** Where a document lives in the repository, or why it does not sync. */
function resolvePath(doc: DocRow, link: LinkRow | undefined, repo: string, docsPath: string) {
  if (link) return { path: link.path };
  if (doc.slug.startsWith("repo-")) {
    const prov = parseProvenance(doc.content);
    // Truncated imports would overwrite the rest of the file; other repositories are not ours.
    if (!prov || prov.truncated || prov.repo.toLowerCase() !== repo.toLowerCase()) return null;
    if (prov.path.includes("..") || prov.path.startsWith("/")) return null;
    return { path: prov.path };
  }
  const path = pathForDocument(doc, docsPath);
  return path ? { path } : null;
}

async function readAll(
  read: (path: string) => Promise<string | null>,
  paths: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < paths.length; i += READ_BATCH) {
    const batch = paths.slice(i, i + READ_BATCH);
    const texts = await Promise.all(batch.map(read));
    batch.forEach((p, n) => out.set(p, texts[n]));
  }
  return out;
}

async function runLocked(connection: Connection, adapter: SyncAdapter, summary: SyncSummary) {
  const { projectId } = connection;
  const docsPath = cleanDocsPath(connection.docsPath) ?? DEFAULT_DOCS_PATH;
  const base = connection.developmentBranch ?? connection.defaultBranch;
  const syncBranch = `${connection.agentBranchPrefix}${BRANCH_NAME}`;
  assertWritableBranch(connection, syncBranch);
  const ref = { fullName: connection.fullName, baseUrl: connection.baseUrl };

  const run = async <T>(use: (token: string | null) => Promise<T>) =>
    connection.credentialId
      ? withSecret(connection.credentialId, { kind: "git", projectId }, use)
      : use(null);

  await run(async (token) => {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    const actor = await actorFor(connection);
    if (!project) return;
    if (!actor) throw new AppError("AUTHORIZATION_ERROR", "No actor for sync");

    const docs = await db.select().from(documents).where(eq(documents.projectId, projectId));
    const eligible = docs.filter((d) => isSyncType(d.type));
    const links = new Map(
      (await db.select().from(documentLinks).where(eq(documentLinks.projectId, projectId))).map(
        (l) => [l.documentId, l],
      ),
    );

    // Decide a path per document; the first claimant of a path wins.
    const claimed = new Map<string, DocRow>();
    // Files an import already owns (even one we leave alone) must not come back as new documents.
    const owned = new Set<string>();
    for (const doc of eligible) {
      const where = resolvePath(doc, links.get(doc.id), connection.fullName, docsPath);
      if (where && !claimed.has(where.path)) claimed.set(where.path, doc);
      const prov = doc.slug.startsWith("repo-") ? parseProvenance(doc.content) : null;
      if (prov && prov.repo.toLowerCase() === connection.fullName.toLowerCase())
        owned.add(prov.path);
    }

    const readFile = async (path: string) =>
      adapter.readFile(ref, token, { path, ref: base }).catch((e) => {
        if (e instanceof GitError && e.code === "not_found") return null;
        throw e;
      });
    const tree = syncableFiles(
      await adapter.getTree(ref, token, { ref: base, path: docsPath }).catch((e) => {
        if (e instanceof GitError && e.code === "not_found") return [];
        throw e;
      }),
    );
    const remote = await readAll(readFile, [
      ...new Set([...claimed.keys(), ...tree.map((f) => f.path)]),
    ]);

    const pushes: {
      doc: DocRow;
      path: string;
      content: string;
      hash: string;
      remote: string | null;
    }[] = [];
    const newConflicts: DocRow[] = [];
    const access = await loadProjectAccess(actor, { id: projectId }, "content:write");

    for (const [path, doc] of claimed) {
      const link = links.get(doc.id);
      const localText = stripProvenance(doc.content);
      const local = hashContent(localText);
      const remoteText = remote.get(path) ?? null;
      const remoteHash = remoteText === null ? null : hashContent(remoteText);
      const decision = decide({
        local,
        remote: remoteHash,
        remoteSeen: link?.remoteHash ?? null,
        pushed: link?.pushedHash ?? null,
      });
      const link0 = { projectId, documentId: doc.id, path };

      switch (decision.action) {
        case "none": {
          if (decision.merged) summary.merged += 1;
          const pending = link?.pushedHash && !decision.merged;
          await upsertLink(db, {
            ...link0,
            remoteHash: remoteHash ?? link?.remoteHash ?? null,
            pushedHash: pending ? (link?.pushedHash ?? null) : null,
            state: pending ? "pending_pr" : "synced",
          });
          break;
        }
        case "push":
          pushes.push({
            doc,
            path,
            content: normalizeContent(localText),
            hash: local,
            remote: remoteHash,
          });
          break;
        case "adopt":
          summary.adopted += 1;
          await upsertLink(db, { ...link0, remoteHash, pushedHash: null, state: "synced" });
          break;
        case "remote_missing":
          summary.missing += 1;
          await upsertLink(db, {
            ...link0,
            remoteHash: link?.remoteHash ?? null,
            pushedHash: link?.pushedHash ?? null,
            state: "remote_missing",
          });
          break;
        case "pull": {
          try {
            await db.transaction(async (tx) => {
              await tx.execute(sql`select set_config('docsync.skip', 'on', true)`);
              await saveDocumentTx(tx, access, {
                docSlug: doc.slug,
                content: remoteText ?? "",
                baseVersion: doc.version,
                source: "sync",
              });
            });
            summary.pulled += 1;
            await upsertLink(db, { ...link0, remoteHash, pushedHash: null, state: "synced" });
          } catch (error) {
            // Signed/archived documents and edits that raced us are kept as they are.
            if (!(isAppError(error) && error.code === "CONFLICT")) throw error;
            summary.conflicts += 1;
            if (link?.state !== "conflict") newConflicts.push(doc);
            await upsertLink(db, {
              ...link0,
              remoteHash: link?.remoteHash ?? null,
              pushedHash: link?.pushedHash ?? null,
              state: "conflict",
              conflictRemote: remoteText,
            });
          }
          break;
        }
        case "conflict":
          summary.conflicts += 1;
          if (link?.state !== "conflict") newConflicts.push(doc);
          await upsertLink(db, {
            ...link0,
            remoteHash: link?.remoteHash ?? null,
            pushedHash: link?.pushedHash ?? null,
            state: "conflict",
            conflictRemote: remoteText,
          });
          break;
      }
    }

    // Files in the docs folder that no document claims become new documents.
    const slugs = new Set(docs.map((d) => d.slug));
    for (const file of tree) {
      if (claimed.has(file.path) || owned.has(file.path)) continue;
      const text = remote.get(file.path);
      if (text == null || text.trim() === "") continue;
      const created = await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('docsync.skip', 'on', true)`);
        return insertSyncedDocumentTx(tx, access, {
          slug: docSlug(file.path, slugs),
          title: `${file.path.split("/").pop()} (GitHub)`,
          content: text,
        });
      });
      summary.created += 1;
      await upsertLink(db, {
        projectId,
        documentId: created.id,
        path: file.path,
        remoteHash: hashContent(text),
        pushedHash: null,
        state: "synced",
      });
    }

    if (pushes.length > 0) {
      const open = await adapter.findOpenPullRequest(ref, token, { head: syncBranch, base: base });
      const branch = await adapter.createBranch(ref, token, { name: syncBranch, from: base });
      if (!open) {
        // The previous pull request was merged or closed: start the branch again from the base.
        const baseSha = (await adapter.listBranches(ref, token)).find((b) => b.name === base)?.sha;
        if (baseSha && baseSha !== branch.sha)
          await adapter.resetBranch(ref, token, { name: syncBranch, to: baseSha });
      }
      await adapter.commitChanges(ref, token, {
        branch: syncBranch,
        message: "docs: sync project documents from Saqina",
        files: pushes.map((p) => ({ path: p.path, content: p.content })),
      });
      const body = [
        "Documents changed in Saqina Dev:",
        ...pushes.map((p) => `- \`${p.path}\``),
        "",
        "Merge to bring them into the repository. Changes made here are pulled back into Saqina.",
      ].join("\n");
      const title = "Sync project documents from Saqina";
      const pr = open
        ? (await adapter.updatePullRequest(ref, token, { number: open.number, title, body }), open)
        : await adapter.createPullRequest(ref, token, { head: syncBranch, base, title, body });
      summary.prUrl = pr.url;
      summary.pushed = pushes.length;
      for (const p of pushes)
        await upsertLink(db, {
          projectId,
          documentId: p.doc.id,
          path: p.path,
          remoteHash: p.remote ?? links.get(p.doc.id)?.remoteHash ?? null,
          pushedHash: p.hash,
          state: "pending_pr",
        });
      await db
        .update(repositoryConnections)
        .set({ docsPrNumber: pr.number, docsPrUrl: pr.url })
        .where(eq(repositoryConnections.id, connection.id));
    } else {
      // Nothing pending any more: forget the pull request that has been merged.
      const pending = await db
        .select({ id: documentLinks.id })
        .from(documentLinks)
        .where(and(eq(documentLinks.projectId, projectId), eq(documentLinks.state, "pending_pr")));
      if (pending.length === 0 && connection.docsPrNumber)
        await db
          .update(repositoryConnections)
          .set({ docsPrNumber: null, docsPrUrl: null })
          .where(eq(repositoryConnections.id, connection.id));
    }

    if (newConflicts.length > 0) {
      await db.transaction(async (tx) => {
        await notifyTx(tx, {
          userIds: await teamRecipients(tx, projectId),
          projectId,
          type: "docs.conflict",
          params: { project: project.name, documents: newConflicts.map((d) => d.title).join(", ") },
          href: `/project/${project.slug}/documents`,
          dedupKey: `docs-conflict:${newConflicts
            .map((d) => d.id)
            .sort()
            .join(",")}:${Date.now()}`,
        });
      });
    }
    await db.transaction((tx) =>
      recordAudit(tx, {
        actorId: actor.id,
        scope: "project",
        projectId,
        type: "docs.synced",
        entityType: "repository",
        entityId: connection.id,
        metadata: { ...summaryMetadata(summary), repository: connection.fullName },
      }),
    );
  });
}

const summaryMetadata = (s: SyncSummary) => ({
  pushed: s.pushed,
  pulled: s.pulled,
  adopted: s.adopted,
  created: s.created,
  conflicts: s.conflicts,
  missing: s.missing,
  merged: s.merged,
});

/**
 * A person settles a conflict: keep Saqina's text (it goes to the sync branch on the next run)
 * or take the repository's (saved as a new Saqina version).
 */
export async function resolveConflict(
  actor: Actor,
  slug: string,
  input: { docSlug: string; keep: "saqina" | "repo" },
  options: SyncOptions = {},
): Promise<void> {
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, access.project.id), eq(documents.slug, input.docSlug)));
  if (!doc) throw new AppError("NOT_FOUND");
  const [link] = await db.select().from(documentLinks).where(eq(documentLinks.documentId, doc.id));
  if (!link || link.state !== "conflict") throw new AppError("NOT_FOUND");

  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('docsync.skip', 'on', true)`);
    if (input.keep === "repo") {
      await saveDocumentTx(tx, access, {
        docSlug: doc.slug,
        content: link.conflictRemote ?? "",
        baseVersion: doc.version,
        source: "sync",
      });
      await upsertLink(tx, {
        projectId: link.projectId,
        documentId: doc.id,
        path: link.path,
        remoteHash: link.conflictRemote === null ? null : hashContent(link.conflictRemote),
        pushedHash: null,
        state: "synced",
      });
    } else {
      // Treat the repository text as seen, so the next run sees Saqina's text as the change.
      await upsertLink(tx, {
        projectId: link.projectId,
        documentId: doc.id,
        path: link.path,
        remoteHash: link.conflictRemote === null ? null : hashContent(link.conflictRemote),
        pushedHash: null,
        state: "synced",
      });
    }
    await tx
      .insert(projectSyncRequests)
      .values({ projectId: access.project.id })
      .onConflictDoUpdate({
        target: projectSyncRequests.projectId,
        set: { requestedAt: sql`now()` },
      });
  });
  await syncProject(access.project.id, options);
}

export async function conflictCount(projectId: string): Promise<number> {
  const rows = await db
    .select({ id: documentLinks.id })
    .from(documentLinks)
    .where(and(eq(documentLinks.projectId, projectId), inArray(documentLinks.state, ["conflict"])));
  return rows.length;
}
