import type { GitProvider } from "@/lib/domain/enums";
import { githubAdapter } from "./github";
import { gitlabAdapter } from "./gitlab";
import { localGitAdapter } from "./local";
import { type GitAdapter, GitError } from "./types";

const unsupported = (provider: GitProvider): GitAdapter => {
  const fail = async (): Promise<never> => {
    throw new GitError("unsupported");
  };
  return {
    provider,
    getRepository: fail,
    listBranches: fail,
    listFiles: fail,
    readFile: fail,
    searchCode: fail,
    createBranch: fail,
    commitChanges: fail,
    createPullRequest: fail,
  };
};

/** Bitbucket is modelled but not implemented yet; it says so instead of pretending. */
export const GIT_ADAPTERS: Record<GitProvider, GitAdapter> = {
  github: githubAdapter,
  gitlab: gitlabAdapter,
  bitbucket: unsupported("bitbucket"),
  custom_local: localGitAdapter,
};
