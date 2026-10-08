import { getTranslations } from "next-intl/server";
import { RunStatusChip } from "@/components/assistant/blocks/run-card";
import { Link } from "@/i18n/navigation";
import type { RunView } from "@/lib/agents/runs";
import { NO_ATTENTION, type ProjectSnapshot } from "@/lib/projects/progress";

/** What waits on a person: approvals, failed agent runs and blocked tasks. */
export async function AttentionPanel({
  slug,
  snapshot,
}: {
  slug: string;
  snapshot: ProjectSnapshot;
}) {
  const t = await getTranslations("assistant.overview");
  const a = snapshot.attention ?? NO_ATTENTION;
  const base = `/project/${slug}`;
  const items = [
    {
      count: a.pendingProposals,
      text: t("approvals", { count: a.pendingProposals }),
      href: `${base}/approvals`,
    },
    {
      count: a.failedRuns,
      text: t("failedRuns", { count: a.failedRuns }),
      href: `${base}/agents#runs`,
    },
    {
      count: snapshot.tasks.blocked,
      text: t("blockedTasks", { count: snapshot.tasks.blocked }),
      href: `${base}/tasks?status=blocked`,
    },
  ].filter((i) => i.count > 0);

  return (
    <section aria-labelledby="attention-heading">
      <h2 id="attention-heading" className="font-medium">
        {t("attention")}
      </h2>
      {items.length ? (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex min-h-11 items-center gap-2 rounded-md border border-warning/40 px-3 py-2 text-sm hover:bg-surface"
              >
                <span aria-hidden="true" className="font-mono text-warning">
                  !
                </span>
                {item.text}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t("nothing")}</p>
      )}
    </section>
  );
}

/** Latest agent runs as a plain list. Functional status, not a visualisation. */
export async function AgentActivityPanel({ slug, runs }: { slug: string; runs: RunView[] }) {
  const t = await getTranslations("assistant.overview");
  return (
    <section aria-labelledby="agent-activity-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="agent-activity-heading" className="font-medium">
          {t("agentActivity")}
        </h2>
        <Link
          href={`/project/${slug}/agents#runs`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t("allRuns")}
        </Link>
      </div>
      {runs.length ? (
        <ul className="mt-3 space-y-2">
          {runs.map(({ run, agentName, taskTitle }) => (
            <li key={run.id}>
              <Link
                href={`/project/${slug}/agents/runs/${run.id}`}
                className="block rounded-md px-1 py-1 hover:bg-surface"
              >
                <span className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className={
                      run.status === "completed" ? "font-mono text-success" : "font-mono text-info"
                    }
                  >
                    {run.status === "completed" ? "✓" : "●"}
                  </span>
                  <span className="font-medium">{agentName}</span>
                  <RunStatusChip status={run.status} />
                </span>
                {taskTitle ? (
                  <span className="block truncate pl-5 text-xs text-muted-foreground">
                    {taskTitle}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t("noRuns")}</p>
      )}
    </section>
  );
}
