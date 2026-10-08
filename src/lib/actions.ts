import "server-only";
import { type ActionResult, errorRef, isAppError } from "./errors";
import { log } from "./log";

/**
 * Runs a server action body and converts every outcome into an ActionResult.
 * Expected failures (validation, auth, not found) keep their code; anything else is logged
 * with a reference and surfaces as INTERNAL_ERROR without implementation details.
 */
export async function runAction<T>(
  operation: string,
  context: Record<string, unknown>,
  body: () => Promise<T>,
): Promise<ActionResult<T>> {
  const started = performance.now();
  try {
    const data = await body();
    log.info(operation, { ...context, ok: true, ms: Math.round(performance.now() - started) });
    return { ok: true, data };
  } catch (error) {
    // redirect()/notFound() use thrown control-flow errors; let Next handle them.
    if (isNextControlFlow(error)) throw error;
    const ms = Math.round(performance.now() - started);
    if (isAppError(error) && error.code !== "INTERNAL_ERROR") {
      log.info(operation, { ...context, ok: false, code: error.code, ms });
      return { ok: false, code: error.code, fields: error.fields };
    }
    const ref = errorRef();
    log.error(operation, { ...context, ok: false, ref, ms, error });
    return { ok: false, code: "INTERNAL_ERROR", ref };
  }
}

function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)/.test(digest)
  );
}
