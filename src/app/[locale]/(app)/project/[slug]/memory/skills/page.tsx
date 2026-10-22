import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { MemoryTabs } from "@/components/memory/memory-tabs";
import { NewSkillButton } from "@/components/memory/skill-dialog";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { getOverview } from "@/lib/memory/queries";
import { listSkills } from "@/lib/memory/skills/queries";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("memoryHub.skills");
  return { title: t("title"), robots: { index: false } };
}

export default async function SkillsPage({
  params,
}: PageProps<"/[locale]/project/[slug]/memory/skills">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const admin = access.role === "owner" || access.role === "admin";
  const [rows, overview, t, tHub] = await Promise.all([
    listSkills(access, ["approved", "archived"]),
    getOverview(access),
    getTranslations("memoryHub.skills"),
    getTranslations("memoryHub"),
  ]);
  const base = `/project/${slug}/memory/skills`;
  const add = can(access.role, "content:write") ? <NewSkillButton slug={slug} /> : null;

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} actions={add} />
      <MemoryTabs slug={slug} active="skills" pending={overview.pendingReview} admin={admin} />
      {rows.length === 0 ? (
        <EmptyState title={t("empty")} body={t("emptyBody")} action={add} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {rows.map(({ asset, skill, stats }) => (
            <li key={asset.id} className="p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link href={`${base}/${asset.id}`} className="font-medium hover:underline">
                  {asset.title}
                </Link>
                <span className="rounded-md border border-border-strong px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {tHub(`visibility.${asset.visibility}`)}
                </span>
                {asset.status === "archived" ? (
                  <span className="font-mono text-xs text-subtle-foreground">
                    {tHub("status.archived")}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">{asset.summary}</p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle-foreground">
                <span>{t("version", { n: asset.version })}</span>
                <span>{t(`origin.${skill.origin}`)}</span>
                {stats.uses === 0 ? (
                  <span>{t("noUses")}</span>
                ) : (
                  <span>
                    {t("uses", { n: stats.uses })} · {t("worked", { n: stats.success })} ·{" "}
                    {t("partial", { n: stats.partial })} · {t("failed", { n: stats.failure })}
                  </span>
                )}
                {stats.runs.success + stats.runs.failure > 0 ? (
                  <span>{t("runs", { ok: stats.runs.success, bad: stats.runs.failure })}</span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
