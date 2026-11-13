import { servePdf } from "@/lib/pdf/serve";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request, ctx: RouteContext<"/api/pdf/invoice/[id]">) {
  return servePdf(request, "invoice", (await ctx.params).id);
}
