import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  codeCalls,
  codeFiles,
  codeImports,
  codeIndexes,
  codeSymbols,
  memoryAssets,
  repositoryConnections,
} from "@/lib/db/schema";
import { linkGraph } from "./resolve";

/** Rows per statement. Far below Postgres's 65,535 parameters, and a VALUES list stays quick. */
const CHUNK = 1000;

async function inChunks<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

/**
 * Joins what every parsed file said about itself: which file an import points at and which symbol
 * a call reaches, then marks the index ready. The updates go out as a few bulk statements, not one
 * per target, so a large repository does not hold a transaction open for long.
 */
export async function linkAndFinish(input: {
  indexId: string;
  projectId: string;
  head: string;
  title: string;
  aliases: Record<string, string>;
  partial: boolean;
}) {
  const { indexId } = input;
  const files = await db
    .select({ id: codeFiles.id, path: codeFiles.path })
    .from(codeFiles)
    .where(and(eq(codeFiles.indexId, indexId), eq(codeFiles.status, "parsed")));
  const fileIds = files.map((f) => f.id);
  const [symbols, imports, calls] = fileIds.length
    ? await Promise.all([
        db.select().from(codeSymbols).where(eq(codeSymbols.indexId, indexId)),
        db.select().from(codeImports).where(inArray(codeImports.fileId, fileIds)),
        db.select().from(codeCalls).where(inArray(codeCalls.fileId, fileIds)),
      ])
    : [[], [], []];

  const linked = linkGraph(
    files,
    symbols,
    imports.map((i) => ({
      id: i.id,
      fileId: i.fileId,
      specifier: i.specifier,
      kind: i.kind,
      bindings: i.bindings,
    })),
    calls.map((c) => ({
      id: c.id,
      fileId: c.fileId,
      callerSymbolId: c.callerSymbolId,
      name: c.calleeName,
      qualifier: c.qualifier,
    })),
    input.aliases,
  );

  await db.transaction(async (tx) => {
    // The repository may have been disconnected while this ran: then nothing of it stays.
    const [conn] = await tx
      .select({ status: repositoryConnections.status })
      .from(repositoryConnections)
      .where(eq(repositoryConnections.projectId, input.projectId))
      .for("update");
    if (!conn || conn.status === "disconnected") {
      await tx
        .delete(memoryAssets)
        .where(eq(memoryAssets.id, sql`(select asset_id from code_indexes where id = ${indexId})`));
      return;
    }
    if (fileIds.length > 0) {
      await tx
        .update(codeImports)
        .set({ resolvedFileId: null })
        .where(inArray(codeImports.fileId, fileIds));
      await tx
        .update(codeCalls)
        .set({ resolvedSymbolId: null, resolution: "name_only" })
        .where(inArray(codeCalls.fileId, fileIds));
    }
    const importRows = [...linked.importTargets].flatMap(([id, target]) =>
      target ? [[id, target]] : [],
    );
    await inChunks(importRows, CHUNK, (chunk) =>
      tx.execute(sql`
        update code_imports i set resolved_file_id = v.target::uuid
        from (values ${sql.join(
          chunk.map(([id, target]) => sql`(${id}::uuid, ${target})`),
          sql`, `,
        )}) as v(id, target)
        where i.id = v.id`),
    );
    const callRows = [...linked.callTargets];
    await inChunks(callRows, CHUNK, (chunk) =>
      tx.execute(sql`
        update code_calls c set resolved_symbol_id = v.target::uuid, resolution = 'resolved'
        from (values ${sql.join(
          chunk.map(([id, target]) => sql`(${id}::uuid, ${target})`),
          sql`, `,
        )}) as v(id, target)
        where c.id = v.id`),
    );
    await tx
      .update(codeIndexes)
      .set({
        status: "ready",
        aliases: input.aliases,
        fileCount: files.length,
        symbolCount: symbols.length,
        // More source files than one index holds: the index says it is partial.
        errorCode: input.partial ? "file_limit" : null,
        indexedAt: new Date(),
      })
      .where(eq(codeIndexes.id, indexId));
    await tx
      .update(memoryAssets)
      .set({ contentHash: input.head, lastIndexedAt: new Date(), title: input.title })
      .where(eq(memoryAssets.id, sql`(select asset_id from code_indexes where id = ${indexId})`));
  });
}
