import "server-only";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ClientProjectAccess } from "@/lib/portal/access";
import { clientApprovalList, clientChangeRequestList } from "@/lib/portal/engagement-views";

export interface AttentionItem {
  slug: string;
  name: string;
  approvals: number;
  changes: number;
}

/** Counts of what waits on the client for one project, from the whitelisted views only. */
export async function loadAttention(access: ClientProjectAccess): Promise<AttentionItem> {
  const [approvals, changes] = await Promise.all([
    clientApprovalList(access),
    clientChangeRequestList(access),
  ]);
  return {
    slug: access.project.slug,
    name: access.project.name,
    approvals: approvals.filter((a) => a.status === "pending").length,
    changes: changes.filter((c) => c.status === "sent").length,
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
    if (item.approvals > 0)
      out.push({
        key: `${item.slug}-approvals`,
        href: `${base}/approvals`,
        text: t("approvals", { count: item.approvals }),
      });
    if (item.changes > 0)
      out.push({
        key: `${item.slug}-changes`,
        href: `${base}/changes`,
        text: t("changes", { count: item.changes }),
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
