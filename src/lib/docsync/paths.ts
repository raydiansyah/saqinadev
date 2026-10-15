import type { DocumentType } from "@/lib/domain/enums";

/**
 * Which documents sync and where they live in the repository. Pure: no database, no network.
 * Business documents (proposal, agreement, handover, maintenance) are deliberately absent:
 * they carry client pricing and terms that must never enter a Git history.
 */

export const DEFAULT_DOCS_PATH = "docs";
const SYNC_TYPES: DocumentType[] = ["prd", "plan", "custom"];

export const isSyncType = (type: DocumentType) => SYNC_TYPES.includes(type);

/** A safe folder name inside the repository, or null. No absolute paths, no "..". */
export function cleanDocsPath(value: string | null | undefined): string | null {
  const path = (value ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!path || path.length > 100) return null;
  if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(path)) return null;
  if (path.split("/").some((part) => part === "." || part === "..")) return null;
  return path;
}

const FIXED: Partial<Record<DocumentType, string>> = { prd: "PRD.md", plan: "PLAN.md" };

/** The repository path of a document Saqina created, or null when it does not sync. */
export function pathForDocument(
  doc: { slug: string; type: DocumentType },
  docsPath: string,
): string | null {
  if (!isSyncType(doc.type)) return null;
  return `${docsPath}/${FIXED[doc.type] ?? `${doc.slug}.md`}`;
}

export interface Provenance {
  repo: string;
  branch: string;
  path: string;
  truncated: boolean;
}

// The header written by the GitHub import in front of every copied document.
const PROVENANCE =
  /^> Imported from https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/blob\/([^/\s]+)\/(\S+?)( \(truncated\))?\r?\n\r?\n/;

export function parseProvenance(content: string): Provenance | null {
  const m = PROVENANCE.exec(content);
  return m ? { repo: m[1], branch: m[2], path: m[3], truncated: Boolean(m[4]) } : null;
}

/** The document as the repository knows it: without the import header. */
export const stripProvenance = (content: string) => content.replace(PROVENANCE, "");

const MAX_SLUG = 64;

/** README.md becomes "repo-readme", docs/api/overview.md "repo-docs-api-overview". */
export function docSlug(path: string, taken: Set<string>): string {
  const base = `repo-${path.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "-")}`
    .toLowerCase()
    .replace(/-+$/g, "")
    .slice(0, MAX_SLUG - 3);
  let slug = base || "repo-doc";
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

const DOC_FILE = /\.(md|mdx)$/i;
export const MAX_SYNC_FILES = 50;
export const MAX_SYNC_BYTES = 200_000;

/** Files in the docs folder that may become documents, in a stable order. */
export function syncableFiles(
  tree: { path: string; size: number }[],
): { path: string; size: number }[] {
  return tree
    .filter((f) => DOC_FILE.test(f.path) && f.size <= MAX_SYNC_BYTES)
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, MAX_SYNC_FILES);
}
