/**
 * Small in-memory sliding-window limiter, per server instance. Enough to stop a runaway
 * client; a shared store (Redis, Upstash) replaces it when the app runs on many instances.
 */
const windows = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    windows.set(key, recent);
    return false;
  }
  recent.push(now);
  windows.set(key, recent);
  return true;
}
