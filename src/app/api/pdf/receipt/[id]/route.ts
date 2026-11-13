import { servePdf } from "@/lib/pdf/serve";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request, ctx: RouteContext<"/api/pdf/receipt/[id]">) {
  return servePdf(request, "receipt", (await ctx.params).id);
}
