import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AssistantPage } from "@/components/assistant/assistant-page";
import { agentOptions } from "@/lib/agents/options";
import { can } from "@/lib/auth/permissions";
import { listConversations, loadMessages } from "@/lib/conversations/service";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("assistant.pages");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function ProjectAssistantPage({
  params,
  searchParams,
}: PageProps<"/[locale]/project/[slug]/assistant">) {
  const { slug } = await params;
  const { c } = await searchParams;
  const access = await projectPageAccess(slug);
  const conversations = await listConversations(access);
  // Only a conversation from this member's own list can be opened; anything else falls back.
  const selected =
    conversations.find((item) => typeof c === "string" && item.id === c) ??
    conversations[0] ??
    null;

  const page = selected ? await loadMessages(access, selected.id) : null;
  const needsAgents = page?.proposals.some((p) => p.actions.some((a) => a.type === "ASSIGN_AGENT"));
  const agents = needsAgents ? await agentOptions(access) : [];

  return (
    <AssistantPage
      slug={slug}
      canWrite={can(access.role, "content:write")}
      conversations={conversations}
      initial={
        page && selected
          ? {
              conversationId: selected.id,
              messages: page.messages,
              proposals: Object.fromEntries(page.proposals.map((p) => [p.id, p])),
              runs: Object.fromEntries(page.runs.map((r) => [r.run.id, r])),
              agents,
              hasMore: page.hasMore,
            }
          : undefined
      }
    />
  );
}
