import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "@/lib/errors";

/**
 * Outbound endpoints configured by users (custom AI providers, MCP servers, agent webhooks)
 * must not reach internal networks. https only; localhost is allowed for development when
 * ALLOW_LOCAL_ENDPOINTS=1 or outside production.
 */

export function localEndpointsAllowed(env = process.env): boolean {
  return env.ALLOW_LOCAL_ENDPOINTS === "1" || env.NODE_ENV !== "production";
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return (
      v === "::1" ||
      v.startsWith("fc") ||
      v.startsWith("fd") ||
      v.startsWith("fe80") ||
      v.startsWith("::ffff:127.")
    );
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export async function assertSafeEndpoint(raw: string, env = process.env): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid URL", { endpoint: "invalid" });
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const local = LOCAL_HOSTS.has(url.hostname) || LOCAL_HOSTS.has(host);
  if (local) {
    if (!localEndpointsAllowed(env))
      throw new AppError("VALIDATION_ERROR", "Local endpoint", { endpoint: "local" });
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new AppError("VALIDATION_ERROR", "Bad protocol", { endpoint: "invalid" });
    return url;
  }
  if (url.protocol !== "https:")
    throw new AppError("VALIDATION_ERROR", "https required", { endpoint: "https" });
  if (url.username || url.password)
    throw new AppError("VALIDATION_ERROR", "Credentials in URL", { endpoint: "invalid" });
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0)
    throw new AppError("VALIDATION_ERROR", "Unresolvable host", { endpoint: "unresolvable" });
  if (addresses.some(isPrivateAddress))
    throw new AppError("VALIDATION_ERROR", "Private address", { endpoint: "private" });
  return url;
}
