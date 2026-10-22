import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db/client";
import {
  codeCalls,
  codeFiles,
  codeImports,
  codeIndexes,
  codeSymbols,
  memoryAssets,
  type memoryJobs,
  projects,
  repositoryConnections,
} from "@/lib/db/schema";
import { AppError, isAppError } from "@/lib/errors";
import { githubAdapter } from "@/lib/git/github";
import { GitError, MAX_FILE_BYTES, type RepoRef, type SyncAdapter } from "@/lib/git/types";
import { log } from "@/lib/log";
import { withSecret } from "@/lib/secrets/service";
import { linkAndFinish } from "./link";
import {
  extensionOf,
  isSourcePath,
  LANGUAGES,
  type ParsedFile,
  parseAliases,
  parserVersion,
  parseSource,
} from "./parse";
import { isTestPath } from "./resolve";
import { enqueueCodeIndex } from "./schedule";

type Job = typeof memoryJobs.$inferSelect;

/** Files read per job run; the rest wait in the next run, so no single run is long. */
const BATCH = 60;
const READ_CONCURRENCY = 6;
/** A run stops taking new files after this long; what is left waits for the next run. */
const RUN_BUDGET_MS = 40_000;
/** A repository larger than this is indexed in part, and says so. */
const MAX_FILES = 1500;
/** What one index may hold. Past it, the files still waiting are skipped and the index says partial. */
const MAX_SYMBOLS_PER_INDEX = 300_000;
const MAX_CALLS_PER_INDEX = 600_000;
/** Rows per insert: far below Postgres's 65,535 bound parameters. */
const INSERT_CHUNK = 1000;
const IGNORED = /(^|\/)(node_modules|dist|coverage|vendor|\.next|\.git|\.turbo|\.cache)\//;

/** Hosts that can list a whole tree. Others are reported as not supported, not half-indexed. */
const treeAdapter = (provider: string): SyncAdapter | null =>
  provider === "github" ? (githubAdapter as SyncAdapter) : null;

async function inChunks<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

/**
 * Reads one branch of the project's repository into the code graph, in resumable steps: list the
 * tree at one commit, mark the files whose content changed, read and parse a batch of them, and
 * once none are left, link imports and calls and mark the index ready. Everything is read at the
 * same commit, so an index always describes one revision. Only names, places and relationships
 * are kept; the code itself is not copied.
 */
export async function runCodeIndex(
  job: Job,
  options: { adapter?: SyncAdapter } = {},
): Promise<void> {
  const projectId = job.projectId;
  const [conn] = await db
    .select()
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, projectId));
  if (!conn || conn.status === "disconnected") return;
  const adapter = options.adapter ?? treeAdapter(conn.provider);
  if (!adapter) return;
  const branch = typeof job.input.branch === "string" ? job.input.branch : conn.defaultBranch;

  const ref: RepoRef = { fullName: conn.fullName, baseUrl: conn.baseUrl };
  const run = (token: string | null) => step(job, conn, adapter, ref, token, branch);
  try {
    if (!conn.credentialId) return await run(null);
    return await withSecret(conn.credentialId, { kind: "git", projectId }, run);
  } catch (error) {
    const code = error instanceof GitError ? error.code : isAppError(error) ? error.code : "failed";
    // Marked failed for the person looking at it; the job retries, which sets it indexing again.
    await db
      .update(codeIndexes)
      .set({ status: "failed", errorCode: code })
      .where(and(eq(codeIndexes.projectId, projectId), eq(codeIndexes.branch, branch)));
    throw error;
  }
}

async function step(
  job: Job,
  conn: typeof repositoryConnections.$inferSelect,
  adapter: SyncAdapter,
  ref: RepoRef,
  token: string | null,
  branch: string,
) {
  const startedAt = Date.now();
  const projectId = job.projectId;
  const isDefault = branch === conn.defaultBranch;
  const head = isDefault
    ? (await adapter.getRepository(ref, token)).headSha
    : ((await adapter.listBranches(ref, token)).find((b) => b.name === branch)?.sha ?? null);
  if (!head) throw new AppError("NOT_FOUND");
  const parser = await parserVersion();

  let [index] = await db
    .select()
    .from(codeIndexes)
    .where(and(eq(codeIndexes.projectId, projectId), eq(codeIndexes.branch, branch)));
  if (index && index.commitSha === head && index.status === "ready" && index.parser === parser) {
    const [{ left }] = await db
      .select({ left: count() })
      .from(codeFiles)
      .where(and(eq(codeFiles.indexId, index.id), eq(codeFiles.status, "pending")));
    if (left === 0) return; // Nothing changed since it was read.
  }

  const title = `${conn.fullName}@${branch}`;
  if (!index) {
    index = await db.transaction(async (tx) => {
      // Two runs for one branch take turns; the second finds the index the first made.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`code:${projectId}:${branch}`}))`,
      );
      const [made] = await tx
        .select()
        .from(codeIndexes)
        .where(and(eq(codeIndexes.projectId, projectId), eq(codeIndexes.branch, branch)));
      if (made) return made;
      // The connection can be disconnected while this runs: then no index is created.
      const [live] = await tx
        .select({ status: repositoryConnections.status })
        .from(repositoryConnections)
        .where(eq(repositoryConnections.projectId, projectId))
        .for("update");
      if (!live || live.status === "disconnected") throw new AppError("NOT_FOUND");
      const [project] = await tx
        .select({ organizationId: projects.organizationId })
        .from(projects)
        .where(eq(projects.id, projectId));
      const [asset] = await tx
        .insert(memoryAssets)
        .values({
          assetType: "code",
          organizationId: project.organizationId,
          projectId,
          ownerId: null,
          visibility: "project",
          status: "approved",
          title,
          searchText: `${conn.fullName} ${branch}`,
          contentHash: head,
        })
        .returning({ id: memoryAssets.id });
      const [row] = await tx
        .insert(codeIndexes)
        .values({
          projectId,
          assetId: asset.id,
          branch,
          commitSha: head,
          parser,
          status: "indexing",
        })
        .returning();
      return row;
    });
  } else {
    const moved = index.commitSha !== head;
    const reparse = index.parser !== parser;
    [index] = await db
      .update(codeIndexes)
      .set({ commitSha: head, parser, status: "indexing", errorCode: null })
      .where(eq(codeIndexes.id, index.id))
      .returning();
    // A new commit gives files that could not be read another try. A new parser reads everything
    // again, because what the old one made may differ (the old rows go when a file is read).
    if (reparse) {
      await db
        .update(codeFiles)
        .set({ status: "pending", reason: null })
        .where(
          and(eq(codeFiles.indexId, index.id), inArray(codeFiles.status, ["parsed", "failed"])),
        );
    } else if (moved) {
      await db
        .update(codeFiles)
        .set({ status: "pending", reason: null })
        .where(and(eq(codeFiles.indexId, index.id), eq(codeFiles.reason, "read_failed")));
    }
  }
  // Keep the connection's idea of the branch's head current, so "stale" compares with the truth.
  if (isDefault) {
    await db
      .update(repositoryConnections)
      .set({ headSha: head })
      .where(eq(repositoryConnections.projectId, projectId));
  }

  const tree = await adapter.getTree(ref, token, { ref: head, path: "" });
  const eligibleTotal = await syncTree(index.id, tree);
  await skipOverBudget(index.id);

  const pending = await db
    .select()
    .from(codeFiles)
    .where(and(eq(codeFiles.indexId, index.id), eq(codeFiles.status, "pending")))
    .orderBy(asc(codeFiles.path))
    .limit(BATCH);
  for (let i = 0; i < pending.length; i += READ_CONCURRENCY) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) break;
    await Promise.all(
      pending
        .slice(i, i + READ_CONCURRENCY)
        .map((file) => readAndStore(adapter, ref, token, head, index.id, file)),
    );
  }

  const [{ left }] = await db
    .select({ left: count() })
    .from(codeFiles)
    .where(and(eq(codeFiles.indexId, index.id), eq(codeFiles.status, "pending")));
  if (left > 0) {
    // The next batch is its own job (the key names this job, so a retry asks for the same one).
    await enqueueCodeIndex(db, { projectId, branch, key: `${branch}:${head}:after:${job.id}` });
    return;
  }

  // The tsconfig is not a source file the graph keeps; it is read once to learn import aliases.
  let aliases: Record<string, string> = {};
  try {
    aliases = await parseAliases(
      await adapter.readFile(ref, token, { path: "tsconfig.json", ref: head }),
    );
  } catch (error) {
    if (!(error instanceof GitError) || error.code !== "not_found") {
      log.warn("code.aliases_unreadable", { error: error instanceof Error ? error.name : "error" });
    }
  }
  await linkAndFinish({
    indexId: index.id,
    projectId,
    head,
    title,
    aliases,
    partial: eligibleTotal > MAX_FILES,
  });
}

/** Marks the tree's files for reading. Returns how many source files the repository has. */
async function syncTree(indexId: string, tree: { path: string; size: number; sha?: string }[]) {
  const all = tree
    .filter((e) => isSourcePath(e.path) && !IGNORED.test(e.path))
    .sort((a, b) => a.path.localeCompare(b.path));
  const eligible = all.slice(0, MAX_FILES);
  const existing = new Map(
    (await db.select().from(codeFiles).where(eq(codeFiles.indexId, indexId))).map((f) => [
      f.path,
      f,
    ]),
  );
  const present = new Set(eligible.map((e) => e.path));
  const gone = [...existing.keys()].filter((p) => !present.has(p));

  await db.transaction(async (tx) => {
    if (gone.length > 0) {
      await inChunks(gone, 500, (chunk) =>
        tx
          .delete(codeFiles)
          .where(and(eq(codeFiles.indexId, indexId), inArray(codeFiles.path, chunk))),
      );
    }
    for (const e of eligible) {
      const sha = e.sha ?? `size:${e.size}`;
      const had = existing.get(e.path);
      const tooLarge = e.size > MAX_FILE_BYTES;
      if (had && had.blobSha === sha) continue;
      const values = {
        blobSha: sha,
        size: e.size,
        isTest: isTestPath(e.path),
        status: tooLarge ? ("skipped" as const) : ("pending" as const),
        reason: tooLarge ? "too_large" : null,
      };
      if (had) {
        // Changed content: what was read from the old content is dropped before it is read again.
        await tx.delete(codeSymbols).where(eq(codeSymbols.fileId, had.id));
        await tx.delete(codeImports).where(eq(codeImports.fileId, had.id));
        await tx.delete(codeCalls).where(eq(codeCalls.fileId, had.id));
        await tx
          .update(codeFiles)
          .set({ ...values, lineCount: 0 })
          .where(eq(codeFiles.id, had.id));
      } else {
        await tx
          .insert(codeFiles)
          .values({
            indexId,
            path: e.path,
            language: LANGUAGES[extensionOf(e.path)] ?? "typescript",
            ...values,
          })
          .onConflictDoNothing();
      }
    }
  });
  return all.length;
}

/** An index holds this much and no more; files still waiting are skipped, and the index is partial. */
async function skipOverBudget(indexId: string) {
  const [[{ symbols }], [{ calls }]] = await Promise.all([
    db.select({ symbols: count() }).from(codeSymbols).where(eq(codeSymbols.indexId, indexId)),
    db
      .select({ calls: count() })
      .from(codeCalls)
      .innerJoin(codeFiles, eq(codeFiles.id, codeCalls.fileId))
      .where(eq(codeFiles.indexId, indexId)),
  ]);
  if (symbols < MAX_SYMBOLS_PER_INDEX && calls < MAX_CALLS_PER_INDEX) return;
  await db
    .update(codeFiles)
    .set({ status: "skipped", reason: "index_budget" })
    .where(and(eq(codeFiles.indexId, indexId), eq(codeFiles.status, "pending")));
}

const failFile = (id: string, reason: string, status: "failed" | "skipped" = "failed") =>
  db.update(codeFiles).set({ status, reason }).where(eq(codeFiles.id, id));

async function readAndStore(
  adapter: SyncAdapter,
  ref: RepoRef,
  token: string | null,
  head: string,
  indexId: string,
  file: typeof codeFiles.$inferSelect,
) {
  let text: string;
  try {
    text = await adapter.readFile(ref, token, { path: file.path, ref: head });
  } catch (error) {
    if (error instanceof GitError && (error.code === "rate_limited" || error.code === "network"))
      throw error;
    if (error instanceof GitError && error.code === "too_large")
      return failFile(file.id, "too_large", "skipped");
    return failFile(file.id, "read_failed");
  }
  let parsed: ParsedFile;
  try {
    parsed = await parseSource(file.path, text);
  } catch {
    return failFile(file.id, "parse_error");
  }
  const ids = parsed.symbols.map(() => randomUUID());
  try {
    await db.transaction(async (tx) => {
      // Two runs on the same file take turns; the second finds it already read and leaves it.
      const [current] = await tx
        .select({ status: codeFiles.status })
        .from(codeFiles)
        .where(eq(codeFiles.id, file.id))
        .for("update");
      if (!current || current.status !== "pending") return;
      await tx.delete(codeSymbols).where(eq(codeSymbols.fileId, file.id));
      await tx.delete(codeImports).where(eq(codeImports.fileId, file.id));
      await tx.delete(codeCalls).where(eq(codeCalls.fileId, file.id));
      await inChunks(
        parsed.symbols.map((s, i) => ({ s, i })),
        INSERT_CHUNK,
        (chunk) =>
          tx.insert(codeSymbols).values(
            chunk.map(({ s, i }) => ({
              id: ids[i],
              indexId,
              fileId: file.id,
              name: s.name,
              kind: s.kind,
              exported: s.exported,
              isDefault: s.isDefault,
              startLine: s.startLine,
              endLine: s.endLine,
              parentId: s.parent === null ? null : (ids[s.parent] ?? null),
            })),
          ),
      );
      await inChunks(parsed.imports, INSERT_CHUNK, (chunk) =>
        tx.insert(codeImports).values(
          chunk.map((i) => ({
            fileId: file.id,
            specifier: i.specifier,
            kind: i.kind,
            bindings: i.bindings,
            line: i.line,
          })),
        ),
      );
      await inChunks(parsed.calls, INSERT_CHUNK, (chunk) =>
        tx.insert(codeCalls).values(
          chunk.map((c) => ({
            fileId: file.id,
            callerSymbolId: c.caller === null ? null : (ids[c.caller] ?? null),
            calleeName: c.name,
            qualifier: c.qualifier,
            line: c.line,
          })),
        ),
      );
      await tx
        .update(codeFiles)
        .set({ status: "parsed", reason: null, lineCount: parsed.lineCount })
        .where(eq(codeFiles.id, file.id));
    });
  } catch (error) {
    // One file the database will not take must not stop the files behind it.
    log.warn("code.store_failed", { error: error instanceof Error ? error.name : "error" });
    await failFile(file.id, "store_error");
  }
}
