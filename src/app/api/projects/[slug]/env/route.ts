import { loadProjectAccess } from "@/lib/auth/permissions";
import { getActor } from "@/lib/auth/server";
import { isAppError } from "@/lib/errors";
import { envExampleFor, envLocalFor } from "@/lib/services/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  AUTHORIZATION_ERROR: 403,
  RATE_LIMIT: 429,
};

/**
 * The project's env files for a developer's machine. `?file=example` (names only) for any member;
 * `?file=local` (values for local development, never the live ones) for project admins only.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/projects/[slug]/env">) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const { slug } = await ctx.params;
  const file = new URL(request.url).searchParams.get("file");
  if (file !== "example" && file !== "local") return new Response(null, { status: 400 });
  try {
    const body =
      file === "example"
        ? await envExampleFor(await loadProjectAccess(actor, { slug }, "project:read"))
        : await envLocalFor(actor, slug);
    return new Response(body, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${file === "example" ? ".env.example" : ".env.local"}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return new Response(null, {
      status: isAppError(error) ? (STATUS[error.code] ?? 500) : 500,
    });
  }
}
