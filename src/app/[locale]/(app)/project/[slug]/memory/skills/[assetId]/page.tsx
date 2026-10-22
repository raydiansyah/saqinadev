import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SkillActions } from "@/components/memory/skill-actions";
import { EditSkillButton } from "@/components/memory/skill-dialog";
import { LocalTime } from "@/components/primitives/local-time";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { isAppError } from "@/lib/errors";
import { getSkillDetail } from "@/lib/memory/skills/queries";
import { contentOf } from "@/lib/memory/skills/store";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("memoryHub.skills");
  return { title: t("title"), robots: { index: false } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function List({ items, empty }: { items: string[]; empty: string }) {
  return items.length === 0 ? (
    <p className="text-sm text-subtle-foreground">{empty}</p>
  ) : (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

export default async function SkillPage({
  params,
}: PageProps<"/[locale]/project/[slug]/memory/skills/[assetId]">) {
  const { slug, assetId } = await params;
  if (!UUID.test(assetId)) notFound();
  const access = await projectPageAccess(slug);
  const detail = await getSkillDetail(access, assetId).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const [t, tHub] = await Promise.all([
    getTranslations("memoryHub.skills"),
    getTranslations("memoryHub"),
  ]);
  const { asset, skill, stats } = detail;
  const content = contentOf(skill, asset);
  const admin = access.role === "owner" || access.role === "admin";
  const manage = detail.canManage && can(access.role, "content:write");
  const none = t("section.none");
  const sec = (key: string) => (
    <h2 className="mb-2 text-sm font-medium text-muted-foreground">
      {t(`section.${key}` as "section.steps")}
    </h2>
  );

  return (
    <article>
      <Link
        href={`/project/${slug}/memory/skills`}
        className="mb-4 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t("back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-balance">
          {asset.title}
        </h1>
        {manage && asset.status !== "rejected" ? (
          <EditSkillButton slug={slug} skill={{ id: asset.id, ...content }} />
        ) : null}
      </div>
      <p className="mt-3 flex flex-wrap gap-2 font-mono text-xs text-muted-foreground">
        <span className="rounded-md border border-border-strong px-2 py-0.5">
          {tHub(`status.${asset.status}`)}
        </span>
        <span className="rounded-md border border-border-strong px-2 py-0.5">
          {tHub(`visibility.${asset.visibility}`)}
        </span>
        <span className="px-1 py-0.5">{t("version", { n: asset.version })}</span>
        <span className="px-1 py-0.5">{t(`origin.${skill.origin}`)}</span>
        {skill.evaluation ? (
          <span className="px-1 py-0.5">{t("score", { n: skill.evaluation.score })}</span>
        ) : null}
      </p>
      <p className="mt-5 text-pretty">{content.description}</p>
      {content.useCase ? (
        <p className="mt-2 text-sm text-muted-foreground">{content.useCase}</p>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          {sec("useWhen")}
          <List items={content.triggers} empty={none} />
        </section>
        <section>
          {sec("doNotUse")}
          <List items={content.exclusions} empty={none} />
        </section>
        <section>
          {sec("needs")}
          <List items={content.prerequisites} empty={none} />
        </section>
        <section>
          {sec("produces")}
          <List items={content.outputs} empty={none} />
        </section>
      </div>
      <section className="mt-8">
        {sec("steps")}
        <ol className="space-y-3">
          {content.steps.map((s, i) => (
            <li
              key={`${s.title}\u0000${s.detail}`}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <p className="font-medium">
                <span className="mr-2 font-mono text-muted-foreground">{i + 1}.</span>
                {s.title}
              </p>
              {s.detail ? (
                <p className="mt-1 text-sm text-pretty text-muted-foreground">{s.detail}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      <section className="mt-8">
        {sec("check")}
        <List items={content.validation} empty={none} />
      </section>
      {content.resources.length > 0 ? (
        <section className="mt-8">
          {sec("resources")}
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {content.resources.map((r) => (
              <li key={`${r.label}\u0000${r.ref}`}>
                {r.label}{" "}
                <span className="font-mono text-xs break-all text-muted-foreground">{r.ref}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {skill.evaluation && skill.evaluation.issues.length > 0 ? (
        <section className="mt-8">
          {sec("review")}
          <ul className="list-disc space-y-1 pl-5 text-sm text-warning">
            {skill.evaluation.issues.map((i) => (
              <li key={i}>{t(`issues.${i}` as "issues.no_validation")}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          {sec("usage")}
          <p className="text-sm">
            {stats.uses === 0
              ? t("noUses")
              : `${t("uses", { n: stats.uses })} · ${t("worked", { n: stats.success })} · ${t("partial", { n: stats.partial })} · ${t("failed", { n: stats.failure })}`}
          </p>
          {stats.runs.success + stats.runs.failure > 0 ? (
            <p className="mt-1 text-xs text-subtle-foreground">
              {t("runs", { ok: stats.runs.success, bad: stats.runs.failure })}
            </p>
          ) : null}
          <ol className="mt-3 space-y-1 text-xs text-subtle-foreground">
            {detail.usages.map((u) => (
              <li key={u.id} className="flex flex-wrap gap-x-3">
                <LocalTime iso={u.createdAt.toISOString()} className="font-mono" />
                <span>{u.outcome ?? "…"}</span>
                {u.note ? <span className="text-muted-foreground">{u.note}</span> : null}
              </li>
            ))}
          </ol>
        </section>
        <section>
          {sec("versions")}
          <ol className="space-y-1 text-sm">
            {detail.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap gap-x-3">
                <span className="font-mono">v{v.version}</span>
                <LocalTime
                  iso={v.createdAt.toISOString()}
                  className="font-mono text-xs text-subtle-foreground"
                />
              </li>
            ))}
          </ol>
          {sec("equipped")}
          <p className="text-sm text-subtle-foreground">
            {detail.bindings.length > 0 ? detail.bindings.map((b) => b.targetId).join(", ") : none}
          </p>
        </section>
      </div>

      <div className="mt-10 border-t border-border pt-6">
        <SkillActions
          slug={slug}
          assetId={asset.id}
          version={asset.version}
          status={asset.status}
          visibility={asset.visibility}
          isOwner={asset.ownerId === access.actor.id}
          admin={admin}
          manage={manage}
        />
      </div>
    </article>
  );
}
