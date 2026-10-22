import { createHash, createHmac } from "node:crypto";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Same formula as the 0017 backfill: one hash for "this exact title and text". */
export const contentHash = (title: string, content: string) => sha256(`${title}\n${content}`);

/** Key of a deleted asset's identity. Stored instead of the content, so nothing sensitive stays. */
export const tombstoneKey = (dedupeKeyOrContentHash: string) =>
  sha256(`tomb:${dedupeKeyOrContentHash}`);

/** Query text is never stored; only this hash, to count repeats. */
export const queryHash = (query: string) =>
  createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "memory-query")
    .update(query.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);

/** Case, accents, punctuation and spacing do not make a text a different text. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Tombstone keys of a text. A text that was private (or only a suggestion) is blocked for its owner
 * alone, so one person's reject never silences someone else's identical suggestion; a shared text
 * is blocked for the whole project. Checks use both keys.
 */
export const textTombKey = (title: string, content: string, ownerId: string | null = null) =>
  `${ownerId ? `own:${ownerId}:` : ""}text:${normalizeText(`${title}\n${content}`)}`;
export const textTombKeys = (title: string, content: string, ownerId: string | null) => [
  textTombKey(title, content),
  ...(ownerId ? [textTombKey(title, content, ownerId)] : []),
];

/** Tombstone key of a skill by its name, scoped to the owner while the skill was not shared. */
export const skillTombKey = (name: string, ownerId: string | null = null) =>
  // A name of only symbols normalises to nothing; it keeps its own text so it blocks only itself.
  `${ownerId ? `own:${ownerId}:` : ""}skill:${normalizeText(name) || name.trim().toLowerCase()}`;
export const skillTombKeys = (name: string, ownerId: string | null) => [
  skillTombKey(name),
  ...(ownerId ? [skillTombKey(name, ownerId)] : []),
];
