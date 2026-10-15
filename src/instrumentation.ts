import type { Instrumentation } from "next";

/** Runs once per server start: reports configuration problems in the logs. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [{ checkEnv }, { log }] = await Promise.all([
    import("@/lib/env-check"),
    import("@/lib/log"),
  ]);
  const report = checkEnv(process.env);
  for (const message of report.errors) log.error("config.invalid", { message });
  for (const message of report.warnings) log.warn("config.warning", { message });
}

/**
 * Every uncaught server error becomes one structured log line. Only the route, method and
 * Next's digest are recorded: never headers, cookies or bodies.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { log } = await import("@/lib/log");
  log.error("request.failed", {
    error: error instanceof Error ? error.message : String(error),
    digest:
      typeof error === "object" && error !== null && "digest" in error
        ? String((error as { digest: unknown }).digest)
        : undefined,
    path: request.path.split("?")[0],
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
  });
};
