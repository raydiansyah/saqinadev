import { readAttachment } from "@/lib/attachments/service";
import { getActor } from "@/lib/auth/server";
import { isAppError } from "@/lib/errors";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves one attachment to a project member. Images display inline; everything else downloads.
 * The file never runs as a page: no sniffing and a sandbox that blocks scripts.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/projects/[slug]/attachments/[id]">,
) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const { slug, id } = await ctx.params;
  try {
    const { view, bytes } = await readAttachment(actor, slug, id);
    const inline = view.kind === "image";
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type": view.mime,
        "content-length": String(bytes.byteLength),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(view.name)}`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; img-src 'self'; sandbox",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") return new Response(null, { status: 404 });
    log.error("attachments.read_failed", { error: String(error) });
    return new Response(null, { status: 500 });
  }
}
