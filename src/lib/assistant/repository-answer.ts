import type { Finding } from "./blocks";
import type { AssistantContext } from "./context-builder";
import type { AssistantCopy } from "./copy/types";
import { answer, type PlannerLabels, type PlanOutcome } from "./planner";

/** Repository answers come only from what was read; every line says where it came from. */
export function repositoryAnswer(
  ctx: AssistantContext,
  copy: AssistantCopy,
  labels: PlannerLabels,
  href: { requirements: string },
): PlanOutcome {
  const repo = ctx.repository?.view;
  if (!repo || repo.status === "disconnected") return answer(copy.repository.notConnected);
  const name = repo.provider === "custom_local" ? "local repository" : repo.fullName;
  const findings: Finding[] = [
    {
      label: "confirmed",
      source: "repository",
      text: copy.repository.summary(name, repo.defaultBranch, repo.headSha?.slice(0, 10) ?? "?"),
    },
    ...Object.entries(repo.detectedStack).map(([k, v]) => ({
      label: "confirmed" as const,
      source: "repository" as const,
      text: copy.repository.detected(k, v),
    })),
    ...Object.entries(ctx.repository?.stack ?? {})
      .filter(([k]) => k !== "repository")
      .map(([k, v]) => ({
        label: (v?.source === "recommended" ? "recommended" : "confirmed") as
          | "recommended"
          | "confirmed",
        source: "project" as const,
        text: copy.repository.intended(k, v?.value ?? ""),
      })),
    ...(ctx.repository?.mismatches ?? []).map((m) => ({
      label: "unknown" as const,
      source: "repository" as const,
      text: copy.repository.mismatch(m.key, m.project, m.repository),
      href: href.requirements.replace("/requirements", ""),
    })),
  ];
  const mismatches = ctx.repository?.mismatches.length ?? 0;
  const read =
    labels.repositoryRead === true
      ? copy.repository.readNow
      : typeof labels.repositoryRead === "string"
        ? copy.repository.readFailed(labels.repositoryRead)
        : "";
  const draft = [
    read,
    mismatches ? copy.repository.mismatchFound(mismatches) : copy.repository.noMismatch,
  ]
    .filter(Boolean)
    .join(" ");
  return answer(draft, [
    {
      type: "analysis",
      title: copy.repository.title,
      findings,
      recommendation: mismatches ? copy.repository.resolveHint : undefined,
    },
  ]);
}
