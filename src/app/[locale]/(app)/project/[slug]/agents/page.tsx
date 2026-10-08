import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AgentCard } from "@/components/agents/agent-card";
import { AgentContext } from "@/components/agents/agent-context";
import { RunList } from "@/components/agents/run-list";
import { TeamCard } from "@/components/agents/team-card";
import { PageHeading } from "@/components/app/states";
import { Notice } from "@/components/ui/form";
import { listAgentRegistry } from "@/lib/agents/registry";
import { listRuns } from "@/lib/agents/runs";
import { listAgents } from "@/lib/agents/service";
import { can } from "@/lib/auth/permissions";
import { bundleContext, serializeContext } from "@/lib/context/serialize";
import { getProjectContext } from "@/lib/context/service";
import { CONTEXT_FILES } from "@/lib/context/types";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agents");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AgentsPage({ params }: PageProps<"/[locale]/project/[slug]/agents">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const { project } = access;
  const [all, context, t, ta, registry, runs] = await Promise.all([
    listAgents(access),
    getProjectContext(access),
    getTranslations("agents"),
    getTranslations("assistant.agents"),
    listAgentRegistry(access),
    listRuns(access, { limit: 20 }),
  ]);
  // Tool agents (Claude, Codex, ...) keep the Phase 2 cards; the Saqina team is listed above.
  const agents = all.filter((a) => a.role === "general");
  const team = registry.agents.filter((a) => a.role !== "general");
  const canManage = can(access.role, "project:update");
  const isPreferred = (a: (typeof agents)[number]) =>
    a.type === project.preferredAgent || a.status === "pending";
  const preferred = agents.find(isPreferred);

  // Serialised on the server from real project data; the client only renders strings.
  const serialized = serializeContext(context);
  const files = CONTEXT_FILES.map((name) => ({ name, content: serialized[name] }));

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <Notice tone="info" className="mb-8">
        {t("foundation")}
      </Notice>

      <section aria-labelledby="team-heading" className="mb-10">
        <h2 id="team-heading" className="text-lg font-semibold">
          {ta("team")}
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{ta("teamHint")}</p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {team.map((agent) => (
            <li key={agent.id}>
              <TeamCard agent={agent} activeRuns={registry.load[agent.id] ?? 0} />
            </li>
          ))}
        </ul>
      </section>

      <section id="runs" aria-labelledby="runs-heading" className="mb-10 scroll-mt-20">
        <h2 id="runs-heading" className="text-lg font-semibold">
          {ta("runs")}
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{ta("runsHint")}</p>
        <RunList slug={slug} runs={runs} />
      </section>

      <section aria-labelledby="agents-heading">
        <h2 id="agents-heading" className="text-lg font-semibold">
          {ta("tools")}
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{ta("toolsHint")}</p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <li key={agent.id}>
              <AgentCard
                slug={slug}
                agent={agent}
                preferred={isPreferred(agent)}
                canManage={canManage}
              />
            </li>
          ))}
        </ul>
      </section>

      <AgentContext
        projectName={project.name}
        agentName={preferred?.name ?? agents[0]?.name ?? "Saqina Dev"}
        files={files}
        bundle={bundleContext(serialized)}
      />
    </>
  );
}
