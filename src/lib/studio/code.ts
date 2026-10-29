import "server-only";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors";
import { getRepository, withRepo } from "@/lib/git/service";
import { GitError } from "@/lib/git/types";
import { scrubSecrets } from "@/lib/secrets/scan";

export interface CodeEntry {
  path: string;
  type: "file" | "dir";
  size: number;
}

/** A path inside the repository: no `..`, no absolute path, at most 300 characters. */
export function safeRepoPath(raw: string): string {
  const path = raw.replace(/^\/+/, "").replace(/\/+$/, "");
  if (path.length > 300 || path.split("/").some((p) => p === ".." || p === "."))
    throw new AppError("VALIDATION_ERROR", "Invalid path", { path: "invalid" });
  return path;
}

/** A host failure becomes a code the page translates, never a generic error. */
async function viaGit<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
    const key =
      error.code === "auth_failed"
        ? "gitAuth"
        : error.code === "not_found"
          ? "gitNotFound"
          : "gitFailed";
    throw new AppError("VALIDATION_ERROR", "Repository unavailable", { repository: key });
  }
}

async function repoOrThrow(access: ProjectAccess) {
  const repo = await getRepository(access);
  if (!repo || repo.status === "disconnected")
    throw new AppError("VALIDATION_ERROR", "Repository not connected", {
      repository: "notConnected",
    });
  return repo;
}

/** One folder of the repository at its default branch, folders first. Read only. */
export async function listCode(access: ProjectAccess, path = ""): Promise<CodeEntry[]> {
  const repo = await repoOrThrow(access);
  const dir = safeRepoPath(path);
  const files = await viaGit(() =>
    withRepo(repo, (adapter, ref, token) =>
      adapter.listFiles(ref, token, { path: dir, ref: repo.defaultBranch }),
    ),
  );
  return files
    .map((f) => ({ path: f.path, type: f.type, size: f.size }) as CodeEntry)
    .sort((a, b) => (a.type === b.type ? a.path.localeCompare(b.path) : a.type === "dir" ? -1 : 1));
}

const MAX_VIEW = 100_000;

/** The text of one file, capped; secrets that look like keys are masked before it is shown. */
export async function readCode(
  access: ProjectAccess,
  path: string,
): Promise<{ path: string; content: string; truncated: boolean }> {
  const repo = await repoOrThrow(access);
  const file = safeRepoPath(path);
  if (!file) throw new AppError("VALIDATION_ERROR", "Invalid path", { path: "invalid" });
  const text = await viaGit(() =>
    withRepo(repo, (adapter, ref, token) =>
      adapter.readFile(ref, token, { path: file, ref: repo.defaultBranch }),
    ),
  );
  return {
    path: file,
    content: scrubSecrets(text.slice(0, MAX_VIEW)),
    truncated: text.length > MAX_VIEW,
  };
}
