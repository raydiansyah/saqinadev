import { getActor } from "@/lib/auth/server";
import { errorRef, isAppError } from "@/lib/errors";
import { getExecutionSnapshot } from "@/lib/executions/view";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS = { AUTHENTICATION_ERROR: 401, AUTHORIZATION_ERROR: 403, NOT_FOUND: 404 } as const;

/**
 * The execution as it is now: tasks, agents, messages, artifacts and the latest events. Whoever
 * is not a member of the project gets the same 404 as for an id that does not exist.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/projects/[slug]/executions/[id]">,
) {
  const actor = await getActor();
  if (!actor) return Response.json({ ok: false, code: "AUTHENTICATION_ERROR" }, { status: 401 });
  const { slug, id } = await ctx.params;
  try {
    const data = await getExecutionSnapshot(actor, slug, id);
    return Response.json({ ok: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (isAppError(error)) {
      const status = STATUS[error.code as keyof typeof STATUS] ?? 400;
      return Response.json(
        { ok: false, code: error.code },
        { status, headers: { "cache-control": "no-store" } },
      );
    }
    const ref = errorRef();
    log.error("executions.snapshot", { ref, error: String(error) });
    return Response.json({ ok: false, code: "INTERNAL_ERROR", ref }, { status: 500 });
  }
}
