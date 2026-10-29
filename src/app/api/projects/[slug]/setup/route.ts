import { loadProjectAccess } from "@/lib/auth/permissions";
import { getActor } from "@/lib/auth/server";
import { isAppError } from "@/lib/errors";
import { agentsMdFor } from "@/lib/mcp/setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** AGENTS.md for a project member to download. Holds no token and no secret. */
export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[slug]/setup">) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const { slug } = await ctx.params;
  try {
    const access = await loadProjectAccess(actor, { slug }, "project:read");
    return new Response(await agentsMdFor(access), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": 'attachment; filename="AGENTS.md"',
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return new Response(null, {
      status: isAppError(error) && error.code === "NOT_FOUND" ? 404 : 500,
    });
  }
}
