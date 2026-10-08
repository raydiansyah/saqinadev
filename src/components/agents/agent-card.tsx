import { getTranslations } from "next-intl/server";
import type { AgentView } from "@/lib/agents/service";
import { cn } from "@/lib/utils";
import { AgentActions } from "./agent-buttons";

const STATUS_TONE = {
  available: "border-border-strong text-muted-foreground",
  connected: "border-success/40 text-success",
  disconnected: "border-warning/50 text-warning",
  pending: "border-info/40 text-info",
  disabled: "border-border text-subtle-foreground",
} as const;

export async function AgentCard({
  slug,
  agent,
  preferred,
  canManage,
}: {
  slug: string;
  agent: AgentView;
  preferred: boolean;
  canManage: boolean;
}) {
  const t = await getTranslations("agents");
  const model = agent.configuration.model;

  return (
    <article
      aria-labelledby={`agent-${agent.id}`}
      className={cn(
        "flex h-full flex-col gap-4 rounded-lg border bg-surface p-5",
        preferred ? "border-primary/60" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`agent-${agent.id}`} className="font-semibold">
            {agent.name}
          </h3>
          <p className="text-sm text-muted-foreground">{agent.provider}</p>
        </div>
        {preferred ? (
          <span className="shrink-0 rounded-md border border-primary/60 px-2 py-0.5 font-mono text-xs text-primary">
            ✓ {t("preferred")}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cn("rounded-md border px-2 py-0.5 font-mono", STATUS_TONE[agent.status])}>
          {t(`statuses.${agent.status}`)}
        </span>
        {model ? <span className="font-mono text-subtle-foreground">{model}</span> : null}
      </div>
      {canManage ? (
        <div className="mt-auto">
          <AgentActions
            slug={slug}
            type={agent.type}
            name={agent.name}
            preferred={preferred}
            configuration={agent.configuration}
          />
        </div>
      ) : null}
    </article>
  );
}
