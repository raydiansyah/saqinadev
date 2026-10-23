import { readFile } from "node:fs/promises";
import { getActor } from "@/lib/auth/server";
import { canReadDocs } from "@/lib/docs/access";
import { docAssetFile, isDocAudience } from "@/lib/docs/content";

export const runtime = "nodejs";

/**
 * Screenshots of the guides. They are not public files: a signed-out visitor gets 401, and a
 * person who may not read that audience's guides gets the same 404 as a name that does not exist.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/docs/assets/[audience]/[name]">,
) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "AUTHENTICATION_ERROR" }, { status: 401 });
  const { audience, name } = await ctx.params;
  const file = isDocAudience(audience) ? docAssetFile(audience, name) : null;
  if (!file || !isDocAudience(audience) || !(await canReadDocs(actor, audience)))
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  try {
    const bytes = await readFile(file);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "image/png",
        // Private: a shared cache must not hand it to someone who is not signed in.
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
}
