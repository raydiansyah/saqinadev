/**
 * Which project changes deserve a memory, and under which key. Pure: no database, so the rules
 * are testable on their own. Routine edits (a task moved, a requirement reworded) are left out on
 * purpose: memory is for what a newcomer or an agent must know, not a log. The activity feed
 * already is the log.
 */

export interface ChangeRow {
  revision: number;
  type: string;
  entityType: string;
  entityId: string | null;
  detail: Record<string, string | number | boolean | null> | null;
}

export type JournalKind = "decision" | "document" | "stack" | "repository";

export interface JournalIntent {
  kind: JournalKind;
  /** Stable per fact; the journal updates the memory with this key instead of adding another. */
  dedupeKey: string;
  entityType: string;
  entityId: string | null;
  detail: ChangeRow["detail"];
}

/** Documents whose revision is a project-level fact. Other documents are listed, not journaled. */
export const JOURNALED_DOCS = ["prd", "plan"] as const;

function intentFor(row: ChangeRow): JournalIntent | null {
  const [domain] = row.type.split(".");
  switch (domain) {
    case "decision":
      // A batch ("count") comes from project creation; the decisions are read as decisions already.
      if (!row.entityId) return null;
      return {
        kind: "decision",
        dedupeKey: `decision:${row.entityId}`,
        entityType: "decision",
        entityId: row.entityId,
        detail: row.detail,
      };
    case "document": {
      const slug = typeof row.detail?.slug === "string" ? row.detail.slug : null;
      if (!slug || !(JOURNALED_DOCS as readonly string[]).includes(slug)) return null;
      return {
        kind: "document",
        dedupeKey: `doc:${slug}`,
        entityType: "document",
        entityId: row.entityId,
        detail: row.detail,
      };
    }
    case "stack": {
      const key = typeof row.detail?.title === "string" ? row.detail.title : null;
      if (!key) return null;
      return {
        kind: "stack",
        dedupeKey: `stack:${key}`,
        entityType: "stack",
        entityId: null,
        detail: row.detail,
      };
    }
    case "repository":
      if (row.type !== "repository.connected") return null;
      return {
        kind: "repository",
        dedupeKey: "repository",
        entityType: "repository",
        entityId: row.entityId,
        detail: row.detail,
      };
    default:
      return null;
  }
}

/**
 * One intent per fact, using the latest change for it, in the order the facts first appeared.
 * Several edits of the PRD in one batch therefore produce one memory update.
 */
export function planJournal(rows: ChangeRow[]): JournalIntent[] {
  const byKey = new Map<string, JournalIntent>();
  for (const row of [...rows].sort((a, b) => a.revision - b.revision)) {
    const intent = intentFor(row);
    if (!intent) continue;
    byKey.delete(intent.dedupeKey);
    byKey.set(intent.dedupeKey, intent);
  }
  return [...byKey.values()];
}
