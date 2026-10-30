import type { GitProvider } from "@/lib/domain/enums";

export interface RepoRef {
  /** owner/name for hosted providers, absolute path for custom_local. */
  fullName: string;
  baseUrl: string | null;
}

export interface RepoInfo {
  fullName: string;
  externalId: string | null;
  defaultBranch: string;
  headSha: string | null;
}

export interface FileEntry {
  path: string;
  type: "file" | "dir";
  size?: number;
}

export interface FileChange {
  path: string;
  content: string;
}

export type GitErrorCode =
  | "auth_failed"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "unsupported"
  | "too_large"
  | "network"
  | "provider_error";

export class GitError extends Error {
  constructor(readonly code: GitErrorCode) {
    super(`Git operation failed: ${code}`);
    this.name = "GitError";
  }
}

/**
 * Normalised repository operations. The project domain talks to this, never to a provider
 * SDK; adding Bitbucket or another host is a new adapter.
 */
export interface GitAdapter {
  provider: GitProvider;
  getRepository(ref: RepoRef, token: string | null): Promise<RepoInfo>;
  listBranches(ref: RepoRef, token: string | null): Promise<{ name: string; sha: string }[]>;
  listFiles(
    ref: RepoRef,
    token: string | null,
    input: { path?: string; ref?: string },
  ): Promise<FileEntry[]>;
  readFile(
    ref: RepoRef,
    token: string | null,
    input: { path: string; ref?: string },
  ): Promise<string>;
  searchCode(ref: RepoRef, token: string | null, query: string): Promise<{ path: string }[]>;
  /** Idempotent: an existing branch with that name is returned, not an error. */
  createBranch(
    ref: RepoRef,
    token: string | null,
    input: { name: string; from: string },
  ): Promise<{ name: string; sha: string }>;
  commitChanges(
    ref: RepoRef,
    token: string | null,
    input: { branch: string; message: string; files: FileChange[] },
  ): Promise<{ sha: string }>;
  createPullRequest(
    ref: RepoRef,
    token: string | null,
    input: { head: string; base: string; title: string; body: string },
  ): Promise<{ number: number; url: string }>;
  /** Files and commits `head` has that `base` does not. Optional: a host without it is shown as unsupported. */
  compare?(
    ref: RepoRef,
    token: string | null,
    input: { base: string; head: string },
  ): Promise<CompareResult>;
}

export const MAX_FILE_BYTES = 200_000;

/** What a work branch changed against its base. The host's own answer, never one we assembled. */
export interface CompareFile {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  /** Unified diff of this file, cut to `MAX_PATCH_CHARS`; null when the host gives none (binary, too large). */
  patch: string | null;
}

export interface CompareResult {
  aheadBy: number;
  files: CompareFile[];
  commits: Array<{ sha: string; message: string }>;
  /** True when there were more files or more text than is returned here. */
  truncated: boolean;
}

export const MAX_COMPARE_FILES = 100;
export const MAX_PATCH_CHARS = 20_000;
export const MAX_TOTAL_PATCH_CHARS = 200_000;

/** Cuts every patch to its limit and the whole to its limit; says if anything was cut. */
export function limitCompare(files: CompareFile[]): { files: CompareFile[]; truncated: boolean } {
  let truncated = files.length > MAX_COMPARE_FILES;
  let budget = MAX_TOTAL_PATCH_CHARS;
  const kept = files.slice(0, MAX_COMPARE_FILES).map((f) => {
    if (f.patch === null) return f;
    const room = Math.min(MAX_PATCH_CHARS, budget);
    if (f.patch.length > room) truncated = true;
    const patch = f.patch.slice(0, Math.max(room, 0));
    budget -= patch.length;
    return { ...f, patch };
  });
  return { files: kept, truncated };
}

/** Counts added and removed lines of a unified diff (headers excluded). */
export function countPatch(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }
  return { additions, deletions };
}

export interface TreeEntry {
  path: string;
  size: number;
  /** The host's id of the file's content, when it gives one. Same id, same content. */
  sha?: string;
}

/**
 * What document sync needs beyond the normalised operations. Only hosts that implement it can
 * sync; the rest keep the plain GitAdapter and are reported as unsupported.
 */
export interface DocSyncOps {
  /** Every file under `path` (all of them when it is empty) at `ref`, recursively. `too_large` when the host truncates the tree. */
  getTree(
    ref: RepoRef,
    token: string | null,
    input: { ref: string; path: string },
  ): Promise<TreeEntry[]>;
  findOpenPullRequest(
    ref: RepoRef,
    token: string | null,
    input: { head: string; base: string },
  ): Promise<{ number: number; url: string } | null>;
  updatePullRequest(
    ref: RepoRef,
    token: string | null,
    input: { number: number; title: string; body: string },
  ): Promise<void>;
  /** When the file at `path` last changed on `ref`, or null when the host does not know. */
  lastChangeAt(
    ref: RepoRef,
    token: string | null,
    input: { path: string; ref: string },
  ): Promise<Date | null>;
  /** Moves a branch (force). Only ever used on the dedicated docs-sync branch. */
  resetBranch(
    ref: RepoRef,
    token: string | null,
    input: { name: string; to: string },
  ): Promise<void>;
}

export type SyncAdapter = GitAdapter & DocSyncOps;
