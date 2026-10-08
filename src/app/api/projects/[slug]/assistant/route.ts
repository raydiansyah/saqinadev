import type { StreamEvent } from "@/lib/assistant/blocks";
import { handleMessage } from "@/lib/assistant/service";
import { getActor } from "@/lib/auth/server";
import { errorRef, isAppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { allow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 16_000;

/** Same-origin only: route handlers do not get the Server Action CSRF check for free. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([new URL(request.url).origin]);
  if (process.env.BETTER_AUTH_URL) allowed.add(new URL(process.env.BETTER_AUTH_URL).origin);
  return allowed.has(origin);
}

const json = (status: number, code: string) =>
  Response.json({ ok: false, code }, { status, headers: { "cache-control": "no-store" } });

/**
 * Sends one message to Saqina and streams the reply as NDJSON events. `/api` is outside the
 * proxy, so this handler authenticates, checks origin and limits rate itself; project
 * membership is checked inside the service.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[slug]/assistant">) {
  if (!sameOrigin(request)) return json(403, "AUTHORIZATION_ERROR");
  const actor = await getActor();
  if (!actor) return json(401, "AUTHENTICATION_ERROR");
  if (!allow(`assistant:${actor.id}`, 20, 60_000)) return json(429, "RATE_LIMIT");

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, "VALIDATION_ERROR");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, "VALIDATION_ERROR");
  }
  const { slug } = await ctx.params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: StreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        await handleMessage(actor, slug, body, emit, { signal: request.signal });
      } catch (error) {
        const code = isAppError(error) ? error.code : "INTERNAL_ERROR";
        const ref = code === "INTERNAL_ERROR" ? errorRef() : undefined;
        if (ref) log.error("assistant.route", { ref, slug, error: String(error) });
        emit({ type: "error", code, ref });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
