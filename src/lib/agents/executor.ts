import type { Locale } from "@/i18n/locales";
import type { PlannedAction } from "@/lib/assistant/actions/types";
import { getAssistantCopy } from "@/lib/assistant/copy";
import type { AgentCapability, AgentPermission, AgentRole, AgentType } from "@/lib/domain/enums";
import { agentCan } from "./capabilities";

/**
 * Agent execution contract. Real executors (Claude, Codex, MCP, ...) will implement the same
 * interface; the orchestrator and UI never care which one ran.
 */

export interface AgentExecutionInput {
  locale: Locale;
  project: { name: string; slug: string };
  agent: {
    name: string;
    type: AgentType;
    role: AgentRole;
    capabilities: AgentCapability[];
    permissions: AgentPermission[];
  };
  task: { id: string; title: string; description: string; priority: string };
  instructions: string;
  /** Only the slices this task needs: never the whole project. */
  context: { prdExcerpt: string | null; requirements: string[] };
  constraints: string[];
  expectedOutput: string;
}

export interface AgentArtifact {
  kind: "checklist" | "note";
  title: string;
  content: string;
}

export interface AgentExecutionResult {
  /** `waiting_external`: work was handed to an external agent; its own report closes the run. */
  status: "completed" | "failed" | "waiting_external";
  summary: string;
  /** Proposed project changes. Applied only after a person approves them. */
  changes: PlannedAction[];
  artifacts: AgentArtifact[];
  recommendations: string[];
  issues: string[];
  needsApproval: boolean;
  /** True when no real external process ran. Always shown to the user. */
  simulated: boolean;
  /** Timeline steps recorded as AGENT_THINKING events. */
  steps: string[];
  error?: string;
  handoffId?: string;
  /** Model that planned the work, when one did. */
  model?: { label: string; source: string; fallbackUsed: boolean } | null;
}

export interface AgentExecutor {
  readonly id: string;
  execute(input: AgentExecutionInput): Promise<AgentExecutionResult>;
}

/**
 * Deterministic, clearly simulated executor for Saqina's own agents. It reads the task and
 * project context and proposes follow-up work; it never claims to have changed code.
 */
export class MockAgentExecutor implements AgentExecutor {
  readonly id = "mock";

  async execute(input: AgentExecutionInput): Promise<AgentExecutionResult> {
    const copy = getAssistantCopy(input.locale);
    const { task, agent } = input;
    const steps = ["context_loaded"];
    if (input.context.prdExcerpt) steps.push("prd_analyzed");
    steps.push("execution_started", "proposal_generated");

    const changes: PlannedAction[] = [];
    if (agentCan(agent, "write_tasks")) {
      const titles = (copy.agent.roleTasks[agent.role] ?? copy.agent.roleTasks.general)(task.title);
      titles.forEach((title, i) =>
        changes.push({
          type: "CREATE_TASK",
          key: `t${i + 1}`,
          payload: {
            title: title.slice(0, 200),
            description: "",
            priority: "medium",
            status: "todo",
            milestoneId: null,
          },
        }),
      );
    }
    const artifacts: AgentArtifact[] = [];
    if ((agent.role === "qa" || agent.role === "frontend") && agentCan(agent, "write_memory")) {
      const checklist = copy.agent.checklist(task.title);
      artifacts.push({
        kind: "checklist",
        title: copy.agent.memoryTitle(task.title),
        content: checklist,
      });
      changes.push({
        type: "CREATE_MEMORY",
        key: "m1",
        payload: {
          title: copy.agent.memoryTitle(task.title).slice(0, 160),
          content: checklist,
          category: "technical",
          importance: "normal",
        },
      });
    }
    const issues: string[] = [];
    if (!input.context.prdExcerpt) issues.push(copy.agent.issues.noPrd);
    if (input.context.requirements.length === 0) issues.push(copy.agent.issues.noRequirements);

    return {
      status: "completed",
      summary: copy.agent.summary(agent.name, task.title),
      changes,
      artifacts,
      recommendations: [copy.agent.recommendation],
      issues,
      needsApproval: changes.length > 0,
      simulated: true,
      steps,
    };
  }
}

/** External agents are not connected in this phase. Fails honestly instead of pretending. */
export class UnavailableExecutor implements AgentExecutor {
  readonly id = "unavailable";

  async execute(input: AgentExecutionInput): Promise<AgentExecutionResult> {
    const copy = getAssistantCopy(input.locale);
    return {
      status: "failed",
      summary: copy.agent.failedSummary,
      changes: [],
      artifacts: [],
      recommendations: [],
      issues: [],
      needsApproval: false,
      simulated: false,
      steps: ["context_loaded"],
      error: "execution_unavailable",
    };
  }
}

export function executorFor(type: AgentType): AgentExecutor {
  return type === "saqina" ? new MockAgentExecutor() : new UnavailableExecutor();
}
