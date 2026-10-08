import { getLocale, getTranslations } from "next-intl/server";
import { RunStatusChip } from "@/components/assistant/blocks/run-card";
import { Link } from "@/i18n/navigation";
import type { RunView } from "@/lib/agents/runs";
import { formatRelative } from "@/lib/format";

/** Agent runs, newest first. Each row opens the run's timeline. */
export async function RunList({ slug, runs }: { slug: string; runs: RunView[] }) {
  const t = await getTranslations("assistant.agents");
  const locale = await getLocale();
  if (runs.length === 0) return <p className="text-sm text-muted-foreground">{t("noRuns")}</p>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {runs.map(({ run, agentName, taskTitle }) => (
        <li key={run.id}>
          <Link
            href={`/project/${slug}/agents/runs/${run.id}`}
            className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-surface"
          >
            <span className="text-sm font-medium">{agentName}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {taskTitle ?? t("noTask")}
            </span>
            <RunStatusChip status={run.status} />
            <span className="font-mono text-xs text-subtle-foreground">
              {t("attempt", { n: run.attempt })} · {formatRelative(run.createdAt, locale)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
