import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import { loadAttention, NeedsAttention } from "@/components/portal/engagement/attention";
import { PortalProjectCard } from "@/components/portal/project-card";
import { requireActorPage } from "@/lib/auth/server";
import { loadClientProjectAccess, portalClients, portalProjects } from "@/lib/portal/access";
import { clientProjectSummaries } from "@/lib/portal/views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.dashboard");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function PortalDashboardPage() {
  const actor = await requireActorPage("/portal");
  const [rows, clients] = await Promise.all([portalProjects(actor), portalClients(actor)]);
  const [projects, attention] = await Promise.all([
    clientProjectSummaries(rows.map((r) => r.project)),
    // Each project is re-checked through the access helper before its counts are read.
    Promise.all(
      rows.map(async (r) => loadAttention(await loadClientProjectAccess(actor, r.project.slug))),
    ),
  ]);
  const t = await getTranslations("portal.dashboard");
  // Greet the company when the user represents exactly one, otherwise the person.
  const name = clients.length === 1 ? clients[0].name : (actor.name.split(/\s+/)[0] ?? actor.name);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {t("hello", { name })}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("intro")}</p>
      </div>
      <NeedsAttention items={attention} showProject />
      {projects.length === 0 ? (
        <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <PortalProjectCard key={p.slug} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
