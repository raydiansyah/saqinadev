import { exportAccount } from "@/lib/account/export";
import { getActor } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Right of access: the signed-in person downloads their own data. Never cached, never shared. */
export async function GET() {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "AUTHENTICATION_ERROR" }, { status: 401 });
  try {
    const data = await exportAccount(actor);
    const day = data.exportedAt.slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="saqina-account-${day}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "RATE_LIMIT")
      return Response.json({ error: "RATE_LIMIT" }, { status: 429 });
    throw error;
  }
}
