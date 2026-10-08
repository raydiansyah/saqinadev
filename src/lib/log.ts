/**
 * Structured server logging: one JSON line per event. Secrets are redacted by key name so a
 * careless `log.error({ input })` cannot leak a password, token or API key.
 */

type Level = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

import { scrubSecrets } from "@/lib/secrets/scan";

const SECRET_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential/i;
const MAX_DEPTH = 4;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1),
      ]),
    );
  }
  // Values that look like keys are hidden even under harmless field names.
  if (typeof value === "string") return scrubSecrets(value);
  return value;
}

function write(level: Level, event: string, fields: LogFields = {}) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...(redact(fields) as LogFields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};

/** Times an operation and logs its outcome with the caller's context. */
export async function traced<T>(
  operation: string,
  context: LogFields,
  run: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await run();
    log.info(operation, { ...context, ok: true, ms: Math.round(performance.now() - started) });
    return result;
  } catch (error) {
    log.warn(operation, {
      ...context,
      ok: false,
      ms: Math.round(performance.now() - started),
      error,
    });
    throw error;
  }
}
