import "server-only";
import type { Actor } from "@/lib/auth/actor";
import { AppError } from "@/lib/errors";
import { gitFetch } from "@/lib/git/http";
import { GitError } from "@/lib/git/types";
import { allow } from "@/lib/rate-limit";
import { disconnect, withGithubToken } from "./connection";

/** What the picker may know about a repository. Built by a whitelist, so nothing else leaks. */
export interface PickerRepo {
  fullName: string;
  private: boolean;
  description: string;
  pushedAt: string | null;
}

const PAGE = 100;
const MAX_PAGES = 3;

type Row = {
  full_name?: unknown;
  private?: unknown;
  description?: unknown;
  pushed_at?: unknown;
  archived?: unknown;
};

export function toPickerRepo(row: Row): PickerRepo | null {
  if (typeof row.full_name !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(row.full_name)) return null;
  return {
    fullName: row.full_name,
    private: row.private === true,
    description: typeof row.description === "string" ? row.description.slice(0, 200) : "",
    pushedAt: typeof row.pushed_at === "string" ? row.pushed_at : null,
  };
}

/**
 * The repositories the connected account can read, most recently pushed first (up to 300).
 * If GitHub says the token is no longer valid, the connection is dropped so the form offers
 * "Connect" again instead of failing every time.
 */
export async function listUserRepos(actor: Actor): Promise<PickerRepo[]> {
  if (!(await allow(`github-repos:${actor.id}`, 30, 10 * 60 * 1000)))
    throw new AppError("RATE_LIMIT");
  try {
    return await withGithubToken(actor, async (token) => {
      const out: PickerRepo[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const rows = await gitFetch<Row[]>(
          `https://api.github.com/user/repos?per_page=${PAGE}&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`,
          {
            headers: {
              accept: "application/vnd.github+json",
              authorization: `Bearer ${token}`,
              "x-github-api-version": "2022-11-28",
              "user-agent": "saqina-dev",
            },
          },
        );
        for (const row of rows) {
          const repo = row.archived === true ? null : toPickerRepo(row);
          if (repo) out.push(repo);
        }
        if (rows.length < PAGE) break;
      }
      return out;
    });
  } catch (error) {
    if (error instanceof GitError && error.code === "auth_failed") {
      await disconnect(actor);
      throw new AppError("VALIDATION_ERROR", "GitHub token is no longer valid", {
        github: "token_invalid",
      });
    }
    if (error instanceof AppError) throw error;
    throw new AppError("VALIDATION_ERROR", "GitHub could not be reached", {
      github: error instanceof GitError ? error.code : "provider_error",
    });
  }
}
