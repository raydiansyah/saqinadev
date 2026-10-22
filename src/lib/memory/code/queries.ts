import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  codeCalls,
  codeFiles,
  codeImports,
  codeIndexes,
  codeSymbols,
  memoryAssets,
  repositoryConnections,
  type SymbolKind,
} from "@/lib/db/schema";
import type { Principal } from "../policy";
import { notExpired, visibleWhere } from "../scope";

/**
 * Questions about the code of a repository branch, answered from the graph. The graph is an aid for
 * finding the way and judging impact, not proof: every answer says which revision it describes and
 * whether the branch has moved since, and calls are marked as resolved or as matched by name only.
 */

export interface Revision {
  indexId: string;
  /** owner/name of the repository this index describes. */
  repository: string;
  branch: string;
  commitSha: string;
  parser: string;
  status: "indexing" | "ready" | "failed";
  indexedAt: Date | null;
  fileCount: number;
  symbolCount: number;
  errorCode: string | null;
  /** The branch has a newer commit than the one that was read. */
  stale: boolean;
  pendingFiles: number;
  failedFiles: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Indexes of the project the requester may read (access is part of the query). */
export async function listRevisions(principal: Principal, projectId: string): Promise<Revision[]> {
  const [conn] = await db
    .select({ branch: repositoryConnections.defaultBranch, head: repositoryConnections.headSha })
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, projectId));
  const rows = await db
    .select({
      i: codeIndexes,
      title: memoryAssets.title,
      pending: sql<number>`(select count(*)::int from code_files f where f.index_id = ${codeIndexes.id} and f.status = 'pending')`,
      failed: sql<number>`(select count(*)::int from code_files f where f.index_id = ${codeIndexes.id} and f.status = 'failed')`,
    })
    .from(codeIndexes)
    .innerJoin(memoryAssets, eq(memoryAssets.id, codeIndexes.assetId))
    .where(
      and(
        visibleWhere(principal, projectId, ["approved"]),
        eq(memoryAssets.assetType, "code"),
        notExpired(),
        eq(codeIndexes.projectId, projectId),
      ),
    )
    .orderBy(desc(codeIndexes.indexedAt))
    .limit(20);
  return rows.map(({ i, pending, failed, title }) => ({
    indexId: i.id,
    repository: title.slice(0, title.lastIndexOf("@")) || title,
    branch: i.branch,
    commitSha: i.commitSha,
    parser: i.parser,
    status: i.status,
    indexedAt: i.indexedAt,
    fileCount: i.fileCount,
    symbolCount: i.symbolCount,
    errorCode: i.errorCode,
    stale: Boolean(conn && i.branch === conn.branch && conn.head && conn.head !== i.commitSha),
    pendingFiles: pending,
    failedFiles: failed,
  }));
}

/** The default branch's index, else the most recent one. The branch can be named. */
export async function pickRevision(
  principal: Principal,
  projectId: string,
  branch?: string | null,
): Promise<Revision | null> {
  const all = await listRevisions(principal, projectId);
  if (branch) return all.find((r) => r.branch === branch) ?? null;
  const [conn] = await db
    .select({ branch: repositoryConnections.defaultBranch })
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, projectId));
  // The default branch only: serving some other branch's index as if it were the default would
  // answer about code the person did not ask about.
  return all.find((r) => r.branch === conn?.branch) ?? null;
}

export interface Answer<T> {
  /** Null when nothing is indexed for the requester: there is no answer, not an empty one. */
  revision: Revision | null;
  items: T[];
}

export interface SymbolHit {
  id: string;
  name: string;
  kind: SymbolKind;
  exported: boolean;
  path: string;
  startLine: number;
  endLine: number;
  /** The class a method belongs to. */
  container: string | null;
  isTest: boolean;
  /** Calls the graph could tie to this symbol. Dynamic calls are not in it. */
  resolvedCallers: number;
}

export async function findSymbols(
  principal: Principal,
  projectId: string,
  options: { query: string; kind?: SymbolKind; branch?: string | null; limit?: number },
): Promise<Answer<SymbolHit>> {
  const revision = await pickRevision(principal, projectId, options.branch);
  const q = options.query.trim().slice(0, 100);
  if (!revision || !q) return { revision, items: [] };
  const parent = db
    .$with("parent")
    .as(
      db
        .select({ id: codeSymbols.id, name: codeSymbols.name })
        .from(codeSymbols)
        .where(eq(codeSymbols.indexId, revision.indexId)),
    );
  const rows = await db
    .with(parent)
    .select({
      s: codeSymbols,
      path: codeFiles.path,
      isTest: codeFiles.isTest,
      container: parent.name,
      callers: sql<number>`(select count(*)::int from code_calls c where c.resolved_symbol_id = ${codeSymbols.id})`,
    })
    .from(codeSymbols)
    .innerJoin(codeFiles, eq(codeFiles.id, codeSymbols.fileId))
    .leftJoin(parent, eq(parent.id, codeSymbols.parentId))
    .where(
      and(
        eq(codeSymbols.indexId, revision.indexId),
        ilike(codeSymbols.name, `%${escapeLike(q)}%`),
        options.kind ? eq(codeSymbols.kind, options.kind) : undefined,
      ),
    )
    // Exact name first, then names that start with it, then the rest; exported before private.
    .orderBy(
      sql`case when lower(${codeSymbols.name}) = ${q.toLowerCase()} then 0 when lower(${codeSymbols.name}) like ${`${escapeLike(q.toLowerCase())}%`} then 1 else 2 end`,
      desc(codeSymbols.exported),
      asc(codeFiles.path),
      asc(codeSymbols.startLine),
    )
    .limit(Math.min(options.limit ?? 20, 50));
  return {
    revision,
    items: rows.map((r) => ({
      id: r.s.id,
      name: r.s.name,
      kind: r.s.kind,
      exported: r.s.exported,
      path: r.path,
      startLine: r.s.startLine,
      endLine: r.s.endLine,
      container: r.container,
      isTest: r.isTest,
      resolvedCallers: r.callers,
    })),
  };
}

export interface CallerHit {
  /** "resolved": syntax and imports tie the call to this symbol. "name_only": only the name matches. */
  resolution: "resolved" | "name_only";
  path: string;
  line: number;
  caller: string | null;
  isTest: boolean;
}

export async function callersOf(
  principal: Principal,
  projectId: string,
  options: { symbolId: string; branch?: string | null },
): Promise<Answer<CallerHit> & { symbol: { name: string; path: string } | null }> {
  const revision = await pickRevision(principal, projectId, options.branch);
  if (!revision) return { revision, items: [], symbol: null };
  const [target] = await db
    .select({ name: codeSymbols.name, id: codeSymbols.id, path: codeFiles.path })
    .from(codeSymbols)
    .innerJoin(codeFiles, eq(codeFiles.id, codeSymbols.fileId))
    .where(and(eq(codeSymbols.id, options.symbolId), eq(codeSymbols.indexId, revision.indexId)));
  if (!target) return { revision, items: [], symbol: null };

  const callerSym = db
    .$with("caller_sym")
    .as(
      db
        .select({ id: codeSymbols.id, name: codeSymbols.name })
        .from(codeSymbols)
        .where(eq(codeSymbols.indexId, revision.indexId)),
    );
  const rows = await db
    .with(callerSym)
    .select({
      resolution: codeCalls.resolution,
      resolved: codeCalls.resolvedSymbolId,
      line: codeCalls.line,
      path: codeFiles.path,
      isTest: codeFiles.isTest,
      caller: callerSym.name,
    })
    .from(codeCalls)
    .innerJoin(codeFiles, eq(codeFiles.id, codeCalls.fileId))
    .leftJoin(callerSym, eq(callerSym.id, codeCalls.callerSymbolId))
    .where(
      and(
        eq(codeFiles.indexId, revision.indexId),
        or(
          eq(codeCalls.resolvedSymbolId, target.id),
          // Same name, not tied to anything: it may be this one. Said so, never asserted.
          and(eq(codeCalls.calleeName, target.name), eq(codeCalls.resolution, "name_only")),
        ),
      ),
    )
    .orderBy(desc(codeCalls.resolution), asc(codeFiles.path), asc(codeCalls.line))
    .limit(100);
  return {
    revision,
    symbol: { name: target.name, path: target.path },
    items: rows.map((r) => ({
      resolution: r.resolved === target.id ? "resolved" : "name_only",
      path: r.path,
      line: r.line,
      caller: r.caller,
      isTest: r.isTest,
    })),
  };
}

export interface DependentHit {
  path: string;
  /** 1 imports the file directly; 2 imports a file that does; and so on. */
  depth: number;
  isTest: boolean;
}

export interface Impact {
  file: {
    path: string;
    isTest: boolean;
    exports: { name: string; kind: SymbolKind; line: number }[];
  } | null;
  dependents: DependentHit[];
  /** The lists stop short: more files than the limit, or dependents deeper than the levels followed. */
  truncated: boolean;
  /** Test files that import the file or anything that depends on it. They may be affected. */
  tests: DependentHit[];
}

export async function impactOf(
  principal: Principal,
  projectId: string,
  options: { path: string; branch?: string | null; depth?: number },
): Promise<{ revision: Revision | null } & Impact> {
  const revision = await pickRevision(principal, projectId, options.branch);
  const none = { file: null, dependents: [], tests: [], truncated: false };
  if (!revision) return { revision, ...none };
  const [file] = await db
    .select()
    .from(codeFiles)
    .where(and(eq(codeFiles.indexId, revision.indexId), eq(codeFiles.path, options.path)));
  if (!file) return { revision, ...none };

  const exports = await db
    .select({ name: codeSymbols.name, kind: codeSymbols.kind, line: codeSymbols.startLine })
    .from(codeSymbols)
    .where(and(eq(codeSymbols.fileId, file.id), eq(codeSymbols.exported, true)))
    .orderBy(asc(codeSymbols.startLine))
    .limit(100);

  const maxDepth = Math.min(options.depth ?? 3, 5);
  const seen = new Map<string, DependentHit>();
  let frontier = [file.id];
  let truncated = false;
  for (let depth = 1; depth <= maxDepth && frontier.length > 0 && seen.size < 500; depth++) {
    const rows = await db
      .selectDistinct({ id: codeFiles.id, path: codeFiles.path, isTest: codeFiles.isTest })
      .from(codeImports)
      .innerJoin(codeFiles, eq(codeFiles.id, codeImports.fileId))
      .where(
        and(inArray(codeImports.resolvedFileId, frontier), eq(codeFiles.indexId, revision.indexId)),
      )
      .limit(500);
    if (rows.length >= 500) truncated = true;
    frontier = [];
    for (const r of rows) {
      if (r.id === file.id || seen.has(r.id)) continue;
      seen.set(r.id, { path: r.path, depth, isTest: r.isTest });
      frontier.push(r.id);
    }
  }
  // Something is left to follow: the depth or the size limit ended the walk, not the graph.
  if (frontier.length > 0) truncated = true;
  const all = [...seen.values()].sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
  return {
    revision,
    file: { path: file.path, isTest: file.isTest, exports },
    dependents: all.filter((d) => !d.isTest),
    truncated,
    tests: all.filter((d) => d.isTest),
  };
}
