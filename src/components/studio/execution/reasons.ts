/**
 * Splits the reason a task stopped into a message key and its parameters, so the screen can say it in
 * the person's language. Unknown reasons are shown as they are: honest, if not pretty.
 */
export function parseReason(
  reason: string | null,
): { key: string; values: Record<string, string> } | null {
  if (!reason) return null;
  if (reason.startsWith("no_agent:")) return { key: "no_agent", values: { role: reason.slice(9) } };
  if (reason.startsWith("write_refused:"))
    return { key: "write_refused", values: { detail: reason.slice(14) } };
  if (reason.startsWith("git_")) return { key: "git_failed", values: { detail: reason.slice(4) } };
  return { key: reason, values: {} };
}
