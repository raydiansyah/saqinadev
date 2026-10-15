type Env = Record<string, string | undefined>;

/**
 * "Connect with GitHub" needs a GitHub OAuth App. Without both values the feature is off and the
 * import form keeps its manual token field, so nobody needs the app to develop.
 */
export function isGithubConnectEnabled(env: Env = process.env): boolean {
  return Boolean(env.GITHUB_OAUTH_CLIENT_ID) && Boolean(env.GITHUB_OAUTH_CLIENT_SECRET);
}

/** The origin visitors use, and the only one the OAuth callback is registered for. */
export function appOrigin(env: Env = process.env): string | null {
  try {
    return new URL(env.BETTER_AUTH_URL ?? "").origin;
  } catch {
    return null;
  }
}

/** Must match the callback URL set on the GitHub OAuth App exactly. */
export function githubCallbackUrl(env: Env = process.env): string | null {
  const origin = appOrigin(env);
  return origin ? `${origin}/api/github/callback` : null;
}

/** `repo` is needed to read private repositories and, later, to sync documents back. */
export const GITHUB_SCOPE = "repo";
