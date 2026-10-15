import { handleMcpRequest } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Saqina's MCP server for one project. Bearer token only; see lib/mcp/server. */
async function handle(request: Request, ctx: RouteContext<"/api/projects/[slug]/mcp">) {
  const { slug } = await ctx.params;
  return handleMcpRequest(request, slug);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
