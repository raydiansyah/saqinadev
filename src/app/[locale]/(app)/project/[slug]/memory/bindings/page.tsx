import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { BindingForm, RevokeBindingButton } from "@/components/memory/bindings-panel";
import { MemoryTabs } from "@/components/memory/memory-tabs";
import { listBindings } from "@/lib/memory/bindings";
import { getOverview, listProjectAgents } from "@/lib/memory/queries";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("memoryHub.bindings");
  return { title: t("title"), robots: { index: false } };
}

export default async function MemoryBindingsPage({
  params,
}: PageProps<"/[locale]/project/[slug]/memory/bindings">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  if (access.role !== "owner" && access.role !== "admin") notFound();
  const [bindings, agents, overview, t, tHub] = await Promise.all([
    listBindings(access),
    listProjectAgents(access),
    getOverview(access),
    getTranslations("memoryHub.bindings"),
    getTranslations("memoryHub"),
  ]);
  const agentName = new Map(agents.map((a) => [a.id, a.name]));

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <MemoryTabs slug={slug} active="bindings" pending={overview.pendingReview} admin />
      <div className="space-y-6">
        <BindingForm slug={slug} agents={agents} />
        {bindings.length === 0 ? (
          <EmptyState title={t("empty")} body={t("description")} />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {bindings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm">
                <span className="font-medium">{agentName.get(b.targetId) ?? b.targetId}</span>
                <span className="text-muted-foreground">
                  {[
                    b.selector?.kind ? tHub(`kind.${b.selector.kind}`) : null,
                    b.selector?.level ? tHub(`level.${b.selector.level}`) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || t("any")}
                </span>
                <span className="font-mono text-xs text-subtle-foreground">
                  {t("priority")} {b.priority}
                </span>
                <span className="sm:ml-auto">
                  <RevokeBindingButton slug={slug} id={b.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
