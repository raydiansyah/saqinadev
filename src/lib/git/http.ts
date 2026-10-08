import { GitError, type GitErrorCode } from "./types";

const codeFor = (status: number): GitErrorCode =>
  status === 401 || status === 403
    ? "auth_failed"
    : status === 404
      ? "not_found"
      : status === 409 || status === 422
        ? "conflict"
        : status === 429
          ? "rate_limited"
          : "provider_error";

/** JSON request with timeout; provider error bodies are never surfaced. */
export async function gitFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new GitError("network");
  }
  if (!response.ok) throw new GitError(codeFor(response.status));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
