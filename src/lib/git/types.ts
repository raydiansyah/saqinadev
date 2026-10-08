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
}

export const MAX_FILE_BYTES = 200_000;
