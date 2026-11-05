import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";

describe("semantic search schema", () => {
  it("has the vector extension, the table, its one-source check and the two settings columns", async () => {
    const ext = await db.execute(sql`select extname from pg_extension where extname = 'vector'`);
    expect(ext.rows).toHaveLength(1);
    const table = await db.execute(sql`select to_regclass('public.memory_embeddings') as t`);
    expect(table.rows[0]?.t).toBe("memory_embeddings");
    const check = await db.execute(
      sql`select conname from pg_constraint where conname = 'memory_embeddings_one_source'`,
    );
    expect(check.rows).toHaveLength(1);
    const columns = await db.execute(sql`
      select table_name, column_name from information_schema.columns
      where (table_name = 'project_settings' and column_name = 'semantic_search_enabled')
         or (table_name = 'platform_ai_settings' and column_name = 'embedding_model_id')`);
    expect(columns.rows).toHaveLength(2);
  });
});
