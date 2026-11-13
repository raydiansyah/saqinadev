import "server-only";
import { eq } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/locales";
import { getActor } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { toLocale } from "@/lib/email/templates";
import { isAppError } from "@/lib/errors";
import { allow } from "@/lib/rate-limit";
import { authorizePdf, type PdfKind } from "./access";
import { buildDocumentPdf, buildInvoicePdf, buildReceiptPdf, type PdfFile } from "./build";

const BUILDERS: Record<PdfKind, (id: string, locale: Locale) => Promise<PdfFile>> = {
  invoice: buildInvoicePdf,
  receipt: buildReceiptPdf,
  document: buildDocumentPdf,
};

/** The route handler behind /api/pdf/*: sign-in, access check, rate limit, then the file. */
export async function servePdf(request: Request, kind: PdfKind, id: string): Promise<Response> {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "AUTHENTICATION_ERROR" }, { status: 401 });
  try {
    await authorizePdf(actor, kind, id);
  } catch (error) {
    if (isAppError(error)) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    throw error;
  }
  // Rendering costs CPU: a person gets a generous but finite number per quarter hour.
  if (!(await allow(`pdf:${actor.id}`, 60, 15 * 60 * 1000)))
    return Response.json({ error: "RATE_LIMIT" }, { status: 429 });
  const lang = new URL(request.url).searchParams.get("lang");
  const [user] = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.id, actor.id));
  const locale = lang && isLocale(lang) ? lang : toLocale(user?.locale);
  try {
    const file = await BUILDERS[kind](id, locale);
    return new Response(file.bytes as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${file.filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND")
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    throw error;
  }
}
