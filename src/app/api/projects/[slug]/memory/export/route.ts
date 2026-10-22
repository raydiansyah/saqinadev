import { getActor } from "@/lib/auth/server";
import { isAppError } from "@/lib/errors";
import { exportMemoryPackage } from "@/lib/memory/transfer/export";

export const dynamic = "force-dynamic";

/**
 * A member downloads the memory and skills they can read, as one JSON file. Session only (no
 * token, no public link), never cached. A project the person is not in is simply not found.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/projects/[slug]/memory/export">,
) {
  // A page on another site must not be able to start a download (and spend the person's hourly budget).
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const part = Number(new URL(request.url).searchParams.get("part") ?? 1);
  const actor = await getActor();
  if (!actor) return Response.json({ error: "AUTHENTICATION_ERROR" }, { status: 401 });
  const { slug } = await ctx.params;
  try {
    const data = await exportMemoryPackage(actor, slug, {
      part: Number.isInteger(part) ? part : 1,
    });
    const day = data.exportedAt.slice(0, 10);
    const suffix = data.part ? `-part${data.part.number}of${data.part.of}` : "";
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="saqina-memory-${slug}-${day}${suffix}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (isAppError(error)) {
      const status = error.code === "RATE_LIMIT" ? 429 : error.code === "NOT_FOUND" ? 404 : 403;
      return Response.json({ error: error.code }, { status });
    }
    throw error;
  }
}
