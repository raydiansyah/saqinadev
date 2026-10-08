/**
 * Post-sign-in destination from a `?next=` parameter. Only same-origin absolute paths are
 * accepted; anything else (other hosts, protocol-relative URLs) falls back to the dashboard.
 */
export function safeNext(next: string | null | undefined, locale: string): string {
  const fallback = `/${locale}/dashboard`;
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\"))
    return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
