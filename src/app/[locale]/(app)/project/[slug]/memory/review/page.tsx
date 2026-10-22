import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { MemoryTabs } from "@/components/memory/memory-tabs";
import { ReviewCard } from "@/components/memory/review-card";
import { SkillReviewActions } from "@/components/memory/skill-actions";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { listReviewQueue } from "@/lib/memory/queries";
import { renderSkill } from "@/lib/memory/skills/content";
import { listSkillReview } from "@/lib/memory/skills/queries";
import { contentOf } from "@/lib/memory/skills/store";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("memoryHub.review");
  return { title: t("title"), robots: { index: false } };
}

export default async function MemoryReviewPage({
  params,
}: PageProps<"/[locale]/project/[slug]/memory/review">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const [queue, skillQueue, tSkills, t, tHub] = await Promise.all([
    listReviewQueue(access),
    listSkillReview(access),
    getTranslations("memoryHub.skills"),
    getTranslations("memoryHub.review"),
    getTranslations("memoryHub"),
  ]);
  const canEdit = can(access.role, "content:write");

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <MemoryTabs
        slug={slug}
        active="review"
        pending={queue.length + skillQueue.length}
        admin={access.role === "owner" || access.role === "admin"}
      />
      {queue.length === 0 && skillQueue.length === 0 ? (
        <EmptyState title={t("empty")} body={t("emptyBody")} />
      ) : (
        <ul className="space-y-4">
          {queue.map(({ asset, memory, sources, conflict }) => (
            <li key={asset.id}>
              {canEdit ? (
                <ReviewCard
                  slug={slug}
                  item={{
                    assetId: asset.id,
                    title: asset.title,
                    content: memory.content,
                    kind: memory.kind,
                    confidence: memory.confidence,
                    sourceLabels: [
                      ...new Set(sources.map((s) => tHub(`sourceType.${s.sourceType}`))),
                    ],
                    conflict,
                    canKeepPrivate: asset.ownerId === access.actor.id,
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {skillQueue.length > 0 ? (
        <section className="mt-10" aria-labelledby="skill-review">
          <h2 id="skill-review" className="mb-1 text-sm font-medium text-muted-foreground">
            {tSkills("forReview")}
          </h2>
          <p className="mb-3 text-xs text-subtle-foreground">{tSkills("reviewHint")}</p>
          <ul className="space-y-4">
            {skillQueue.map(({ asset, skill }) => (
              <li key={asset.id} className="rounded-lg border border-border bg-surface p-4">
                <Link
                  href={`/project/${slug}/memory/skills/${asset.id}`}
                  className="font-medium hover:underline"
                >
                  {asset.title}
                </Link>
                {/* The reviewer reads the whole skill, steps and all, not only its description. */}
                <pre className="mt-3 max-h-80 overflow-auto rounded-md border border-border p-3 font-sans text-sm whitespace-pre-wrap text-muted-foreground">
                  {renderSkill(contentOf(skill, asset))}
                </pre>
                {skill.resources.length > 0 ? (
                  <p className="mt-2 font-mono text-xs break-all text-subtle-foreground">
                    {skill.resources.map((r) => `${r.label}: ${r.ref}`).join(" · ")}
                  </p>
                ) : null}
                {skill.evaluation && skill.evaluation.issues.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5 text-xs text-warning">
                    {skill.evaluation.issues.map((i) => (
                      <li key={i}>{tSkills(`issues.${i}` as "issues.no_validation")}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-subtle-foreground">
                  <span>{tSkills(`origin.${skill.origin}`)}</span>
                  {skill.evaluation ? (
                    <span>{tSkills("score", { n: skill.evaluation.score })}</span>
                  ) : null}
                </p>
                {canEdit ? (
                  <SkillReviewActions
                    slug={slug}
                    assetId={asset.id}
                    version={asset.version}
                    isOwner={asset.ownerId === access.actor.id}
                    admin={access.role === "owner" || access.role === "admin"}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
