import "server-only";
import { and, count, eq, inArray, notExists } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db/client";
import { documentSignatures, documents } from "@/lib/db/schema";
import { SIGNABLE_KINDS } from "@/lib/documents/reference";
import type { ClientProjectAccess } from "@/lib/portal/access";
import { clientInvoices } from "@/lib/portal/views";

export interface AttentionItem {
  slug: string;
  name: string;
  /** Shared agreements the client has not signed yet. */
  unsigned: number;
  /** Issued invoices past their due date. */
  overdue: number;
}

/** Counts of what waits on the client for one project, from the whitelisted views only. */
export async function loadAttention(access: ClientProjectAccess): Promise<AttentionItem> {
  const [[unsigned], invoices] = await Promise.all([
    db
      .select({ n: count() })
      .from(documents)
      .where(
        and(
          eq(documents.projectId, access.project.id),
          eq(documents.clientVisible, true),
          eq(documents.status, "approved"),
          inArray(documents.type, [...SIGNABLE_KINDS]),
          notExists(
            db
              .select({ id: documentSignatures.id })
              .from(documentSignatures)
              .where(
                and(
                  eq(documentSignatures.documentId, documents.id),
                  eq(documentSignatures.party, "client"),
                ),
              ),
          ),
        ),
      ),
    clientInvoices(access),
  ]);
  return {
    slug: access.project.slug,
    name: access.project.name,
    unsigned: unsigned?.n ?? 0,
    overdue: invoices.filter((i) => i.status === "overdue").length,
  };
}

/**
 * "Needs your attention" block. Renders nothing when nothing waits. With `showProject`
 * (dashboard) each line is prefixed with the project name.
 */
export async function NeedsAttention({
  items,
  showProject = false,
}: {
  items: AttentionItem[];
  showProject?: boolean;
}) {
  const t = await getTranslations("portalEngagement.attention");
  const lines = items.flatMap((item) => {
    const base = `/portal/projects/${item.slug}`;
    const out: { key: string; href: string; text: string }[] = [];
    if (item.unsigned > 0)
      out.push({
        key: `${item.slug}-unsigned`,
        href: `${base}/documents`,
        text: t("unsigned", { count: item.unsigned }),
      });
    if (item.overdue > 0)
      out.push({
        key: `${item.slug}-overdue`,
        href: `${base}/invoices`,
        text: t("overdue", { count: item.overdue }),
      });
    return showProject
      ? out.map((line) => ({
          ...line,
          text: t("project", { project: item.name, items: line.text }),
        }))
      : out;
  });
  if (lines.length === 0) return null;

  return (
    <section
      aria-labelledby="attention-heading"
      className="rounded-lg border border-warning/40 bg-warning/5 p-5"
    >
      <h2 id="attention-heading" className="font-medium">
        {t("title")}
      </h2>
      <ul className="mt-3 space-y-1">
        {lines.map((line) => (
          <li key={line.key}>
            <Link
              href={line.href}
              className="inline-flex min-h-11 items-center break-words text-sm underline-offset-4 hover:underline"
            >
              {line.text}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
