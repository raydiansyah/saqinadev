import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StudioShell } from "@/components/studio/studio-shell";
import { agentOptions } from "@/lib/agents/options";
import { listRuns } from "@/lib/agents/runs";
import { can } from "@/lib/auth/permissions";
import { listConversations, loadMessages } from "@/lib/conversations/service";
import { getDeployState } from "@/lib/deploy/service";
import { getDocument } from "@/lib/documents/service";
import { listExecutions } from "@/lib/executions/service";
import { projectPageAccess } from "@/lib/projects/page";
import { envSync, getServicesState } from "@/lib/services/service";
import { getGitState } from "@/lib/studio/git-state";
import { listMilestones, listTasks } from "@/lib/tasks/service";

/** Plan and Build finish their work after the response; this is how long that may last. */
export const maxDuration = 300;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("studio");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Chat beside a live work area: the plan, the agents at work, and (later) code and preview. */
export default async function StudioPage({ params }: PageProps<"/[locale]/project/[slug]/studio">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const [conversations, milestones, tasks, runs, prd, git, deploy, services, gap, executions] =
    await Promise.all([
      listConversations(access),
      listMilestones(access),
      listTasks(access),
      listRuns(access, { limit: 30 }),
      getDocument(access, "prd"),
      getGitState(access),
      getDeployState(access),
      getServicesState(access),
      envSync(access),
      listExecutions(access.actor, slug, 20),
    ]);
  const latest = conversations[0] ?? null;
  const page = latest ? await loadMessages(access, latest.id) : null;
  const needsAgents = page?.proposals.some((p) => p.actions.some((a) => a.type === "ASSIGN_AGENT"));
  const agents = needsAgents ? await agentOptions(access) : [];

  return (
    <StudioShell
      slug={slug}
      canWrite={can(access.role, "content:write")}
      buildsInSaqina={access.project.buildStrategy === "saqina"}
      git={git}
      deploy={deploy}
      services={{ ...services, gap }}
      canManage={can(access.role, "project:update")}
      prdApproved={prd?.status === "approved" || prd?.status === "signed"}
      executions={executions.map((e) => ({
        id: e.id,
        mode: e.mode,
        status: e.status,
        request: e.request,
        createdAt: e.createdAt.toISOString(),
      }))}
      plan={{
        milestones: milestones.map((m) => ({ id: m.id, title: m.title, goal: m.goal })),
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          milestoneId: t.milestoneId,
        })),
      }}
      runs={runs.map(({ run, agentName, taskTitle }) => ({
        id: run.id,
        status: run.status,
        agentName,
        taskTitle,
        createdAt: run.createdAt.toISOString(),
      }))}
      initial={
        page && latest
          ? {
              conversationId: latest.id,
              messages: page.messages,
              proposals: Object.fromEntries(page.proposals.map((p) => [p.id, p])),
              runs: Object.fromEntries(page.runs.map((r) => [r.run.id, r])),
              agents,
              hasMore: page.hasMore,
              chapters: page.chapters,
              agentReads: page.agentReads,
              info: page.conversation,
            }
          : undefined
      }
    />
  );
}
