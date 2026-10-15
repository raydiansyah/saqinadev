import { after } from "next/server";
import { syncProject } from "@/lib/docsync/engine";
import { handleGithubWebhook } from "@/lib/docsync/webhook";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GitHub push webhook: pulls documents changed in the repository into the project. */
export async function POST(request: Request, ctx: RouteContext<"/api/git/webhook/[connectionId]">) {
  const { connectionId } = await ctx.params;
  return handleGithubWebhook(request, connectionId, {
    schedule: (projectId) =>
      after(async () => {
        await syncProject(projectId).catch((error) =>
          log.warn("docsync.webhook_sync_failed", { error: String(error) }),
        );
      }),
  });
}
