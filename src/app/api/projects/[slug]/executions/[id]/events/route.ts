import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { getActor } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { executions } from "@/lib/db/schema";
import { isAppError } from "@/lib/errors";
import { listEventsSince } from "@/lib/executions/events";
import { nudgeWorker } from "@/lib/executions/schedule";
import { TERMINAL_EXECUTION_STATUSES } from "@/lib/executions/state";
import { allow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One connection lasts this long. The browser reconnects by itself, with the last event number. */
const WINDOW_MS = 50_000;
const ACTIVE_POLL_MS = 1000;
const IDLE_POLL_MS = 3000;
const PING_MS = 15_000;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

/**
 * Server-sent events of one execution, read from its stored event log. Nothing is kept in memory
 * per client: a reconnect with `Last-Event-ID` (or `?after=`) gets exactly what it missed, in order,
 * so a dropped connection loses nothing and a replay cannot repeat an event.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/projects/[slug]/executions/[id]/events">,
) {
  const actor = await getActor();
  if (!actor) return Response.json({ ok: false, code: "AUTHENTICATION_ERROR" }, { status: 401 });
  const { slug, id } = await ctx.params;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  if (!(await allow(`execution:sse:${actor.id}`, 40, 60_000)))
    return Response.json({ ok: false, code: "RATE_LIMIT" }, { status: 429 });
  let projectId: string;
  try {
    projectId = (await loadProjectAccess(actor, { slug }, "project:read")).project.id;
  } catch (error) {
    const status = isAppError(error) && error.code === "NOT_FOUND" ? 404 : 403;
    return Response.json(
      { ok: false, code: isAppError(error) ? error.code : "AUTHORIZATION_ERROR" },
      { status },
    );
  }
  const [row] = await db
    .select({ id: executions.id })
    .from(executions)
    .where(and(eq(executions.id, id), eq(executions.projectId, projectId)));
  if (!row) return Response.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });

  const url = new URL(request.url);
  const given = Number(request.headers.get("last-event-id") ?? url.searchParams.get("after") ?? 0);
  let last = Number.isFinite(given) && given > 0 ? Math.floor(given) : 0;
  const scope = { executionId: id, projectId };
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The client went away.
        }
      };
      const end = Date.now() + WINDOW_MS;
      let lastPing = Date.now();
      send("retry: 2000\n\n");
      void nudgeWorker(id).catch(() => undefined);
      try {
        while (Date.now() < end && !request.signal.aborted) {
          const events = await listEventsSince(db, scope, last, 100);
          for (const e of events) {
            send(
              `id: ${e.seq}\nevent: execution\ndata: ${JSON.stringify({ seq: e.seq, type: e.type, payload: e.payload, createdAt: e.createdAt })}\n\n`,
            );
            last = e.seq;
            lastPing = Date.now();
          }
          const [state] = await db
            .select({ status: executions.status })
            .from(executions)
            .where(eq(executions.id, id));
          // A finished execution has nothing more to say once everything before it was sent.
          if (events.length === 0 && state && TERMINAL_EXECUTION_STATUSES.includes(state.status)) {
            send(`event: end\ndata: ${JSON.stringify({ seq: last, status: state.status })}\n\n`);
            break;
          }
          if (Date.now() - lastPing > PING_MS) {
            send(": ping\n\n");
            lastPing = Date.now();
          }
          // A finished execution adds no more events: check once more at once instead of waiting.
          const finished = state ? TERMINAL_EXECUTION_STATUSES.includes(state.status) : false;
          if (events.length < 100 && !finished)
            await sleep(
              state?.status === "running" ||
                state?.status === "planning" ||
                state?.status === "cancelling"
                ? ACTIVE_POLL_MS
                : IDLE_POLL_MS,
              request.signal,
            );
        }
      } finally {
        void nudgeWorker(id).catch(() => undefined);
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-content-type-options": "nosniff",
      "x-accel-buffering": "no",
    },
  });
}
