import type { AgentCapability, AgentRole, AgentStatus, AgentType } from "@/lib/domain/enums";

export interface SelectableAgent {
  id: string;
  name: string;
  type: AgentType;
  role: AgentRole;
  status: AgentStatus;
  capabilities: AgentCapability[];
  priority: number;
}

export type SelectionReason =
  | { code: "covers"; capabilities: AgentCapability[] }
  | { code: "missing"; capabilities: AgentCapability[] }
  | { code: "busy"; runs: number }
  | { code: "preferred" }
  | { code: "executable" }
  | { code: "notExecutable" }
  | { code: "disabled" };

export interface RankedAgent {
  agent: SelectableAgent;
  score: number;
  reasons: SelectionReason[];
}

export interface SelectionInput {
  required: AgentCapability[];
  agents: SelectableAgent[];
  /** Active (queued/running/waiting) runs per agent id. */
  load?: Record<string, number>;
  preferredType?: AgentType | null;
  /** Agent types that can actually execute in this environment. */
  executableTypes?: readonly AgentType[];
}

/**
 * Ranks agents for a task. Capability coverage dominates (the first required capability is
 * the primary one and counts double); availability, executability, preference and priority
 * break ties. Agents with no matching capability or a disabled status are never selected.
 */
export function rankAgents({
  required,
  agents,
  load = {},
  preferredType = null,
  executableTypes = ["saqina"],
}: SelectionInput): RankedAgent[] {
  const ranked: RankedAgent[] = [];
  for (const agent of agents) {
    const reasons: SelectionReason[] = [];
    if (agent.status === "disabled") continue;
    const covered = required.filter((c) => agent.capabilities.includes(c));
    if (covered.length === 0) continue;
    const missing = required.filter((c) => !agent.capabilities.includes(c));
    const weight = required.length + 1;
    let score = ((covered.length + (covered.includes(required[0]) ? 1 : 0)) / weight) * 100;
    reasons.push({ code: "covers", capabilities: covered });
    if (missing.length) reasons.push({ code: "missing", capabilities: missing });

    // An agent that cannot run here is only suggested when no runnable agent fits.
    if (executableTypes.includes(agent.type)) {
      score += 100;
      reasons.push({ code: "executable" });
    } else {
      reasons.push({ code: "notExecutable" });
    }
    const runs = load[agent.id] ?? 0;
    if (runs > 0) {
      score -= Math.min(runs, 3) * 5;
      reasons.push({ code: "busy", runs });
    }
    if (preferredType && agent.type === preferredType && agent.role === "general") {
      score += 5;
      reasons.push({ code: "preferred" });
    }
    score += agent.priority;
    ranked.push({ agent, score: Math.round(score * 10) / 10, reasons });
  }
  // Stable order for equal scores keeps selection deterministic.
  return ranked.sort((a, b) => b.score - a.score || a.agent.name.localeCompare(b.agent.name));
}

export function selectAgent(input: SelectionInput): RankedAgent | null {
  return rankAgents(input)[0] ?? null;
}
