import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments/detect";
import { uploadAttachment } from "@/lib/attachments/service";
import { getActor } from "@/lib/auth/server";
import { errorRef, isAppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { sameOrigin } from "@/lib/net/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  AUTHENTICATION_ERROR: 401,
  AUTHORIZATION_ERROR: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  RATE_LIMIT: 429,
};

const reply = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Uploads one chat attachment (multipart, field `file`). The service checks membership. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[slug]/attachments">,
) {
  if (!sameOrigin(request)) return reply(403, { ok: false, code: "AUTHORIZATION_ERROR" });
  const actor = await getActor();
  if (!actor) return reply(401, { ok: false, code: "AUTHENTICATION_ERROR" });
  // Refuse an oversized body before reading it; multipart adds a little framing.
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_ATTACHMENT_BYTES + 64_000)
    return reply(413, { ok: false, code: "VALIDATION_ERROR", fields: { file: "tooLarge" } });
  const { slug } = await ctx.params;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return reply(400, { ok: false, code: "VALIDATION_ERROR", fields: { file: "required" } });
    const data = await uploadAttachment(actor, slug, {
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return reply(200, { ok: true, data });
  } catch (error) {
    if (isAppError(error))
      return reply(STATUS[error.code] ?? 500, {
        ok: false,
        code: error.code,
        fields: error.fields,
      });
    const ref = errorRef();
    log.error("attachments.upload_failed", { ref, error: String(error) });
    return reply(500, { ok: false, code: "INTERNAL_ERROR", ref });
  }
}
