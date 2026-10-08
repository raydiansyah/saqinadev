import { and, desc, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { AgentsPanel } from "@/components/integrations/agents-panel";
import { McpPanel } from "@/components/integrations/mcp-panel";
import { RepositoryPanel } from "@/components/integrations/repository-panel";
import { Link } from "@/i18n/navigation";
import { listHandoffs } from "@/lib/agents/handoff";
import { listAgentRegistry } from "@/lib/agents/registry";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { tasks, toolExecutions } from "@/lib/db/schema";
import { formatRelative } from "@/lib/format";
import { localGitAllowed } from "@/lib/git/local";
import { getRepository, toRepositoryView } from "@/lib/git/service";
import { listMcpConnections, listProjectTools } from "@/lib/mcp/service";
import { projectPageAccess } from "@/lib/projects/page";
import { ensureProjectTools } from "@/lib/tools/registry";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("integrations");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Each section loads only its own data. */
export default async function IntegrationsPage({
  params,
}: PageProps<"/[locale]/project/[slug]/integrations">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  await ensureProjectTools(db, access.project.id);
  const [repo, connections, tools, registry, openTasks, handoffs, executions, t, locale] =
    await Promise.all([
      getRepository(access),
      listMcpConnections(access),
      listProjectTools(access),
      listAgentRegistry(access),
      db
        .select({ id: tasks.id, title: tasks.title })
        .from(tasks)
        .where(and(eq(tasks.projectId, access.project.id), ne(tasks.status, "done")))
        .orderBy(tasks.position)
        .limit(100),
      listHandoffs(access, 10),
      db
        .select({
          id: toolExecutions.id,
          toolName: toolExecutions.toolName,
          source: toolExecutions.source,
          status: toolExecutions.status,
          errorCode: toolExecutions.errorCode,
          createdAt: toolExecutions.createdAt,
        })
        .from(toolExecutions)
        .where(eq(toolExecutions.projectId, access.project.id))
        .orderBy(desc(toolExecutions.createdAt))
        .limit(20),
      getTranslations("integrations"),
      getLocale(),
    ]);
  const canManage = can(access.role, "project:update");
  const external = registry.agents
    .filter((a) => a.type !== "saqina")
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      strategy: a.connectionStrategy,
      endpoint: a.endpoint,
      connectionStatus: a.connectionStatus,
      hasSecret: Boolean(a.credentialId),
    }));

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <div className="space-y-6">
        <RepositoryPanel
          slug={slug}
          repo={repo ? toRepositoryView(repo) : null}
          canManage={canManage}
          localAllowed={localGitAllowed()}
        />
        <McpPanel
          slug={slug}
          connections={connections}
          tools={tools.filter((x) => x.source === "mcp")}
          canManage={canManage}
        />
        <AgentsPanel
          slug={slug}
          agents={external}
          tasks={openTasks}
          canManage={can(access.role, "content:write")}
        />

        <section aria-labelledby="handoffs-heading" className="rounded-lg border border-border p-5">
          <h2 id="handoffs-heading" className="font-semibold">
            {t("handoff.list")}
          </h2>
          {handoffs.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("handoff.none")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {handoffs.map((h) => (
                <li key={h.id}>
                  <Link
                    href={`/project/${slug}/agents/handoffs/${h.id}`}
                    className="flex min-h-11 flex-wrap items-center gap-x-3 py-2 text-sm hover:bg-surface"
                  >
                    <span className="font-medium">{h.agentName}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {h.taskTitle ?? "-"}
                    </span>
                    <span className="font-mono text-xs">{t(`handoff.statuses.${h.status}`)}</span>
                    <span className="font-mono text-xs text-subtle-foreground">
                      v{h.contextVersion} · {formatRelative(h.createdAt, locale)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="audit-heading" className="rounded-lg border border-border p-5">
          <h2 id="audit-heading" className="font-semibold">
            {t("audit.title")}
          </h2>
          {executions.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("audit.none")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {executions.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 py-2">
                  <span className="font-mono">{e.toolName}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(`mcp.sources.${e.source}`)}
                  </span>
                  <span
                    className={
                      e.status === "succeeded"
                        ? "text-xs text-success"
                        : e.status === "failed" || e.status === "denied"
                          ? "text-xs text-error"
                          : "text-xs text-warning"
                    }
                  >
                    {t(`audit.statuses.${e.status}`)}
                    {e.errorCode ? ` (${e.errorCode})` : ""}
                  </span>
                  <span className="ml-auto font-mono text-xs text-subtle-foreground">
                    {formatRelative(e.createdAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
