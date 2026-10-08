import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { ProposalList } from "@/components/assistant/proposal-list";
import { Notice } from "@/components/ui/form";
import { agentOptions } from "@/lib/agents/options";
import { can } from "@/lib/auth/permissions";
import { projectPageAccess } from "@/lib/projects/page";
import { listProposals } from "@/lib/proposals/repository";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("assistant.approvals");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function ApprovalsPage({
  params,
}: PageProps<"/[locale]/project/[slug]/approvals">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const [pending, history, t] = await Promise.all([
    listProposals(access, { status: ["pending"] }),
    listProposals(access, {
      status: ["approved", "rejected", "revision_requested", "cancelled", "expired"],
      limit: 20,
    }),
    getTranslations("assistant.approvals"),
  ]);
  const canReview = can(access.role, "content:write");
  const needsAgents = pending.some((p) => p.actions.some((a) => a.type === "ASSIGN_AGENT"));
  const agents = needsAgents ? await agentOptions(access) : [];

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      {!canReview ? (
        <Notice tone="info" className="mb-6">
          {t("readOnly")}
        </Notice>
      ) : null}

      <section aria-labelledby="pending-heading">
        <h2
          id="pending-heading"
          className="mb-3 font-mono text-xs uppercase tracking-wide text-subtle-foreground"
        >
          {t("waiting")} ({pending.length})
        </h2>
        {pending.length ? (
          <ProposalList slug={slug} proposals={pending} agents={agents} canReview={canReview} />
        ) : (
          <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />
        )}
      </section>

      <section aria-labelledby="history-heading" className="mt-10">
        <h2
          id="history-heading"
          className="mb-3 font-mono text-xs uppercase tracking-wide text-subtle-foreground"
        >
          {t("history")}
        </h2>
        {history.length ? (
          <ProposalList slug={slug} proposals={history} agents={[]} canReview={false} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
        )}
      </section>
    </>
  );
}
