import { log } from "@/lib/log";

/** Error codes safe to show an Owner. Raw provider bodies never leave this module. */
export type ProviderErrorCode =
  | "auth_failed"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "network"
  | "bad_response"
  | "provider_error";

export class AiProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly status?: number,
  ) {
    super(`AI provider error: ${code}`);
    this.name = "AiProviderError";
  }
}

export function codeForStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "provider_error";
}

export const TIMEOUT_MS = 45_000;

/** fetch with timeout + caller abort, mapping failures to safe codes. */
export async function request(
  url: string,
  init: RequestInit & { signal?: AbortSignal | null; adapter: string },
): Promise<Response> {
  const signals = [AbortSignal.timeout(TIMEOUT_MS)];
  if (init.signal) signals.push(init.signal);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.any(signals) });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    const name = (error as Error).name;
    throw new AiProviderError(name === "TimeoutError" ? "timeout" : "network");
  }
  if (!response.ok) {
    log.warn("ai.provider_http_error", { adapter: init.adapter, status: response.status });
    throw new AiProviderError(codeForStatus(response.status), response.status);
  }
  return response;
}

/** Yields the `data:` payloads of a server-sent event stream. */
export async function* sseData(body: ReadableStream): AsyncIterable<string> {
  const reader = (body as ReadableStream<BufferSource>)
    .pipeThrough(new TextDecoderStream())
    .getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";
    for (const event of events) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) yield data;
    }
  }
}

export const trimSlash = (url: string) => url.replace(/\/+$/, "");
