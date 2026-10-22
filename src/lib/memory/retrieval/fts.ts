import { type SQL, sql } from "drizzle-orm";

/** Words of a question that are worth matching: letters or digits, at least three of them. */
export function queryWords(query: string): string[] {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  return [...new Set(words)].slice(0, 12);
}

/**
 * The full-text query for a question. A natural question rarely has all its words in one passage,
 * so by default any word matches and `ts_rank` puts the passages with more of them first. A query
 * that uses quotes or a minus sign is passed through `websearch_to_tsquery`, which understands them.
 */
export function tsQuery(query: string): SQL {
  if (/["]|(^|\s)-\S/.test(query)) return sql`websearch_to_tsquery('simple', ${query})`;
  const words = queryWords(query);
  // No usable word: a query that matches nothing, instead of a syntax error.
  if (words.length === 0) return sql`websearch_to_tsquery('simple', ${query})`;
  return sql`to_tsquery('simple', ${words.join(" | ")})`;
}
