import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AssetActions } from "@/components/memory/asset-actions";
import { EditMemoryButton } from "@/components/memory/memory-buttons";
import { SourceList } from "@/components/memory/source-list";
import { LocalTime } from "@/components/primitives/local-time";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { isAppError } from "@/lib/errors";
import { getAssetDetail } from "@/lib/memory/queries";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("memory");
  return { title: t("metaTitle"), robots: { index: false } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MemoryAssetPage({
  params,
}: PageProps<"/[locale]/project/[slug]/memory/[assetId]">) {
  const { slug, assetId } = await params;
  if (!UUID.test(assetId)) notFound();
  const access = await projectPageAccess(slug);
  // A memory the viewer may not read looks exactly like one that does not exist.
  const detail = await getAssetDetail(access, assetId).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const t = await getTranslations("memoryHub");
  const { asset, memory } = detail;
  const manage = detail.canManage && can(access.role, "content:write");

  return (
    <article>
      <Link
        href={`/project/${slug}/memory`}
        className="mb-4 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t("detail.back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-balance">
          {asset.title}
        </h1>
        {manage && asset.status !== "rejected" ? (
          <EditMemoryButton
            slug={slug}
            memory={{
              id: memory.id,
              title: memory.title,
              content: memory.content,
              category: memory.category,
              importance: memory.importance,
            }}
          />
        ) : null}
      </div>
      <p className="mt-3 flex flex-wrap gap-2 font-mono text-xs text-muted-foreground">
        <span className="rounded-md border border-border-strong px-2 py-0.5">
          {t(`status.${asset.status}`)}
        </span>
        <span className="rounded-md border border-border-strong px-2 py-0.5">
          {t(`level.${memory.level}`)}
        </span>
        <span className="rounded-md border border-border-strong px-2 py-0.5">
          {t(`kind.${memory.kind}`)}
        </span>
        <span className="rounded-md border border-border-strong px-2 py-0.5">
          {t(`confidence.${memory.confidence}`)}
        </span>
        <span className="rounded-md border border-border-strong px-2 py-0.5">
          {t(`visibility.${asset.visibility}`)}
        </span>
        <span className="px-1 py-0.5">{t("detail.version", { n: asset.version })}</span>
      </p>
      {asset.conflictWithId ? (
        <p className="mt-4 rounded-md border border-warning/50 px-3 py-2 text-sm text-warning">
          {t("detail.conflictOpen")}
        </p>
      ) : null}
      <p className="mt-6 text-pretty whitespace-pre-line">{memory.content}</p>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="sources">
          <h2 id="sources" className="mb-3 text-sm font-medium text-muted-foreground">
            {t("detail.sources")}
          </h2>
          <SourceList sources={detail.sources} />
        </section>
        <section aria-labelledby="bindings">
          <h2 id="bindings" className="mb-3 text-sm font-medium text-muted-foreground">
            {t("detail.bindings")}
          </h2>
          <p className="text-sm text-subtle-foreground">
            {detail.bindings.length > 0
              ? detail.bindings.map((b) => b.targetId).join(", ")
              : t("detail.noBindings")}
          </p>
        </section>
        <section aria-labelledby="versions">
          <h2 id="versions" className="mb-3 text-sm font-medium text-muted-foreground">
            {t("detail.versions")}
          </h2>
          <ol className="space-y-2 text-sm">
            {detail.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap gap-x-3">
                <span className="font-mono">v{v.version}</span>
                <span className="min-w-0 text-muted-foreground">{v.title}</span>
                <LocalTime
                  iso={v.createdAt.toISOString()}
                  className="font-mono text-xs text-subtle-foreground"
                />
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="history">
          <h2 id="history" className="mb-3 text-sm font-medium text-muted-foreground">
            {t("detail.history")}
          </h2>
          <ol className="space-y-2 text-sm">
            {detail.history.length === 0 ? (
              <li className="text-subtle-foreground">{t("detail.none")}</li>
            ) : (
              detail.history.map((h) => (
                <li key={h.id} className="flex flex-wrap gap-x-3">
                  <span className="font-mono text-xs">{h.type}</span>
                  <LocalTime
                    iso={h.createdAt.toISOString()}
                    className="font-mono text-xs text-subtle-foreground"
                  />
                </li>
              ))
            )}
          </ol>
        </section>
      </div>

      {manage ? (
        <div className="mt-10 border-t border-border pt-6">
          <AssetActions
            slug={slug}
            assetId={asset.id}
            status={asset.status}
            level={memory.level}
            visibility={asset.visibility}
            isOwner={asset.ownerId === access.actor.id}
          />
        </div>
      ) : null}
    </article>
  );
}
