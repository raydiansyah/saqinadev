import { getTranslations } from "next-intl/server";
import { FORBIDDEN_PERMISSIONS } from "@/lib/agents/capabilities";
import type { AgentRow } from "@/lib/agents/registry";

const CHIP = "inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs leading-none";

/**
 * A Saqina specialist. Capabilities (what it is good at) and permissions (what it may touch)
 * are shown separately so nobody reads a skill as a grant.
 */
export async function TeamCard({ agent, activeRuns }: { agent: AgentRow; activeRuns: number }) {
  const t = await getTranslations("assistant.agents");
  const granted = agent.permissions.filter((p) => !FORBIDDEN_PERMISSIONS.includes(p));
  return (
    <article className="flex h-full flex-col rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{agent.name}</h3>
          <p className="text-xs text-muted-foreground">
            {t(`roles.${agent.role}`)} · {t("provider")}: {agent.provider}
          </p>
        </div>
        <span className={`${CHIP} shrink-0 border-border text-subtle-foreground`}>
          {t("simulated")}
        </span>
      </div>
      {activeRuns > 0 ? (
        <p className="mt-2 font-mono text-xs text-info">{t("activeRuns", { count: activeRuns })}</p>
      ) : null}

      <h4 className="mt-4 font-mono text-[0.6875rem] uppercase tracking-wider text-subtle-foreground">
        {t("capabilitiesHeading")}{" "}
        <span className="normal-case tracking-normal">· {t("capabilitiesHint")}</span>
      </h4>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {agent.capabilities.map((c) => (
          <li key={c} className={`${CHIP} border-border-strong text-muted-foreground`}>
            {t(`capabilities.${c}`)}
          </li>
        ))}
      </ul>

      <h4 className="mt-4 font-mono text-[0.6875rem] uppercase tracking-wider text-subtle-foreground">
        {t("permissionsHeading")}{" "}
        <span className="normal-case tracking-normal">· {t("permissionsHint")}</span>
      </h4>
      <p className="mt-1.5 text-sm text-pretty">
        {t("can", { list: granted.map((p) => t(`permissions.${p}`)).join(", ") })}
      </p>
      <p className="mt-1 text-sm text-muted-foreground text-pretty">
        {t("never", { list: FORBIDDEN_PERMISSIONS.map((p) => t(`permissions.${p}`)).join(", ") })}
      </p>
    </article>
  );
}
