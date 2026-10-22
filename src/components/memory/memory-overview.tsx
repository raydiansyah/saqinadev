import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Overview } from "@/lib/memory/queries";

function Tile({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <p className="font-mono text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </>
  );
  const cls = "block rounded-lg border border-border bg-surface p-4";
  return href ? (
    <Link href={href} className={`${cls} hover:border-border-strong`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Real counts only: what the viewer can read, and the state of background work. */
export async function MemoryOverview({
  slug,
  overview,
  admin,
}: {
  slug: string;
  overview: Overview;
  admin: boolean;
}) {
  const t = await getTranslations("memoryHub");
  const base = `/project/${slug}/memory`;
  return (
    <section className="mb-8 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t("stats.approved")} value={overview.byStatus.approved ?? 0} />
        <Tile label={t("stats.pending")} value={overview.pendingReview} href={`${base}/review`} />
        <Tile label={t("stats.skills")} value={overview.skills} href={`${base}/skills`} />
        <Tile label={t("stats.wiki")} value={overview.wikiPages} href={`${base}/wiki`} />
        {admin ? (
          <>
            <Tile label={t("stats.queued")} value={overview.jobs.queued} href={`${base}/jobs`} />
            <Tile label={t("stats.failed")} value={overview.jobs.failed} href={`${base}/jobs`} />
          </>
        ) : (
          <Tile label={t("stats.agents")} value={overview.boundAgents} />
        )}
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{t("levels.title")}</dt>
          <dd className="font-mono">
            {(["L1", "L2", "L3"] as const)
              .map((l) => `${t(`levels.${l}`)} ${overview.byLevel[l] ?? 0}`)
              .join(" · ")}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{t("stats.semantic")}</dt>
          <dd>{t("semanticOff")}</dd>
        </div>
      </dl>
      {overview.mostUsed.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t("mostUsed")}</h2>
          <ul className="space-y-1 text-sm">
            {overview.mostUsed.map(({ asset }) => (
              <li key={asset.id}>
                <Link href={`${base}/${asset.id}`} className="hover:underline">
                  {asset.title}
                </Link>{" "}
                <span className="font-mono text-subtle-foreground">×{asset.useCount}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-subtle-foreground">{t("noUsage")}</p>
      )}
    </section>
  );
}
