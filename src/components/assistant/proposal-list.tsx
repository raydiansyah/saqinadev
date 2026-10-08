"use client";

import { useRouter } from "@/i18n/navigation";
import { ProposalCard } from "./blocks/proposal-card";
import type { AgentOption, ProposalView } from "./types";

/** Proposals outside a conversation (Approvals page). Reviewing refreshes the workspace. */
export function ProposalList({
  slug,
  proposals,
  agents,
  canReview,
}: {
  slug: string;
  proposals: ProposalView[];
  agents: AgentOption[];
  canReview: boolean;
}) {
  const router = useRouter();
  return (
    <ul className="space-y-4">
      {proposals.map((proposal) => (
        <li key={proposal.id}>
          <ProposalCard
            slug={slug}
            proposal={proposal}
            agents={agents}
            canReview={canReview}
            onChanged={() => router.refresh()}
          />
        </li>
      ))}
    </ul>
  );
}
