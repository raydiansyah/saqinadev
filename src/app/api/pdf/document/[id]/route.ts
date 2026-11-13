import { servePdf } from "@/lib/pdf/serve";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request, ctx: RouteContext<"/api/pdf/document/[id]">) {
  return servePdf(request, "document", (await ctx.params).id);
}
