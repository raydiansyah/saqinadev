import { containsSecret } from "@/lib/secrets/scan";

export const MAX_FILES = 12;
export const MAX_FILE_CHARS = 100_000;
export const MAX_TOTAL_CHARS = 300_000;

/** Never written by an agent, whatever the task says. */
const DENIED = [
  /^\.git(\/|$)/,
  /(^|\/)\.env($|\.)/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)(id_rsa|id_ed25519)($|\.)/,
  /\.(pem|p12|pfx|key)$/i,
];

export type WriteProblem =
  | { code: "too_many_files" | "too_large" | "duplicate_path" | "no_write_scope" }
  | { code: "bad_path" | "denied_path" | "out_of_scope" | "secret_in_content"; path: string };

/** A repository path: relative, no `..`, no backslash, no NUL. Null when it is none of that. */
export function normalizePath(raw: string): string | null {
  const path = raw.replace(/^\.?\/+/, "").replace(/\/+$/, "");
  if (!path || path.length > 300 || path.includes("\\") || path.includes("\u0000")) return null;
  if (path.split("/").some((part) => part === ".." || part === "." || part === "")) return null;
  return path;
}

/** True when `path` is one of the targets or sits under one of them. */
export function inScope(path: string, targets: readonly string[]): boolean {
  return targets.some((t) => {
    const target = t.replace(/\/+$/, "");
    return path === target || path.startsWith(`${target}/`);
  });
}

/**
 * Checks everything an agent wants to write before any of it is committed. All or nothing: one
 * bad file refuses the lot, so a half-done change never lands. A task without target paths has
 * no write scope, so it cannot write at all.
 */
export function checkWrites(
  files: ReadonlyArray<{ path: string; content: string }>,
  targets: readonly string[],
):
  | { ok: true; files: Array<{ path: string; content: string }> }
  | { ok: false; problems: WriteProblem[] } {
  const problems: WriteProblem[] = [];
  if (targets.length === 0) return { ok: false, problems: [{ code: "no_write_scope" }] };
  if (files.length > MAX_FILES) problems.push({ code: "too_many_files" });
  if (files.reduce((n, f) => n + f.content.length, 0) > MAX_TOTAL_CHARS)
    problems.push({ code: "too_large" });
  const seen = new Set<string>();
  const clean: Array<{ path: string; content: string }> = [];
  for (const file of files) {
    const path = normalizePath(file.path);
    if (!path) {
      problems.push({ code: "bad_path", path: file.path.slice(0, 80) });
      continue;
    }
    if (DENIED.some((re) => re.test(path))) problems.push({ code: "denied_path", path });
    else if (!inScope(path, targets)) problems.push({ code: "out_of_scope", path });
    if (file.content.length > MAX_FILE_CHARS) problems.push({ code: "too_large" });
    if (containsSecret(file.content)) problems.push({ code: "secret_in_content", path });
    if (seen.has(path)) problems.push({ code: "duplicate_path" });
    seen.add(path);
    clean.push({ path, content: file.content });
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, files: clean };
}

export const describeProblems = (problems: readonly WriteProblem[]) =>
  problems.map((p) => ("path" in p ? `${p.code}:${p.path}` : p.code)).join(", ");
