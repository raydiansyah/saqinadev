import { getActor } from "@/lib/auth/server";
import { isAppError } from "@/lib/errors";
import { readLogo } from "@/lib/white-label/brand";

export const runtime = "nodejs";

/**
 * An organization's logo. Not a public file: only people of that organization and its clients
 * can read it, and a closed white label serves nothing. The type was read from the bytes when
 * the logo was saved; `nosniff` and the sandbox keep a browser from treating it as anything else.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/brand/[orgId]/logo">) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "AUTHENTICATION_ERROR" }, { status: 401 });
  const { orgId } = await ctx.params;
  try {
    const { bytes, mime } = await readLogo(actor, orgId);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": mime,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND")
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    throw error;
  }
}
