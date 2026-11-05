import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "@/lib/domain/memory";
import { memoryAssets } from "./memory";
import { aiModels } from "./platform";
import { projects } from "./projects";
import { wikiChunks } from "./wiki";

/**
 * One vector per embedded text. Exactly one of `asset_id` (chat memory) or `chunk_id` (a wiki
 * passage) is set, so deleting the source deletes its vector. `content_hash` is the hash of the
 * exact text that was embedded: a changed text no longer matches and is embedded again.
 */
export const memoryEmbeddings = pgTable(
  "memory_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => memoryAssets.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id").references(() => wikiChunks.id, { onDelete: "cascade" }),
    modelId: uuid("model_id")
      .notNull()
      .references(() => aiModels.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("memory_embeddings_asset_idx").on(t.assetId, t.modelId),
    uniqueIndex("memory_embeddings_chunk_idx").on(t.chunkId, t.modelId),
    index("memory_embeddings_project_idx").on(t.projectId, t.modelId),
    check("memory_embeddings_one_source", sql`(${t.assetId} is null) <> (${t.chunkId} is null)`),
  ],
);
