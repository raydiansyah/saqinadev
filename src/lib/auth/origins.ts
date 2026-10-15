/**
 * Origins Better Auth accepts for browser requests. The configured base URL is always trusted,
 * and so is its www / non-www twin, because visitors reach a site by both. Extra origins (a
 * staging host, for example) come from BETTER_AUTH_TRUSTED_ORIGINS, comma separated.
 */

type Env = Record<string, string | undefined>;

const isNamedHost = (host: string) =>
  /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) && /[a-z]/i.test(host);

export function trustedOrigins(env: Env = process.env): string[] {
  const origins = new Set<string>();
  const add = (value: string) => {
    try {
      origins.add(new URL(value.trim()).origin);
    } catch {
      // Ignore malformed entries rather than refusing to boot.
    }
  };

  if (env.BETTER_AUTH_URL) {
    add(env.BETTER_AUTH_URL);
    try {
      const base = new URL(env.BETTER_AUTH_URL);
      // localhost, IPs and ports are left alone: only real domains have a www twin.
      if (isNamedHost(base.hostname) && !base.port) {
        const twin = base.hostname.startsWith("www.")
          ? base.hostname.slice(4)
          : `www.${base.hostname}`;
        add(`${base.protocol}//${twin}`);
      }
    } catch {
      // BETTER_AUTH_URL itself is malformed: Better Auth reports that on its own.
    }
  }
  for (const extra of (env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(","))
    if (extra.trim()) add(extra);
  return [...origins];
}
