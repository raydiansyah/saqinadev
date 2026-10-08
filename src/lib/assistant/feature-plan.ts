import { inferRequiredCapabilities } from "@/lib/agents/capabilities";
import { selectAgent } from "@/lib/agents/selector";
import type { AgentType } from "@/lib/domain/enums";
import type { PlannedAction } from "./actions/types";
import type { AssistantContext } from "./context-builder";
import type { AssistantCopy, Clarification } from "./copy/types";
import { act, type PlannerLabels, type PlanOutcome } from "./planner";

/** Feature requests: which question to ask first, which agent fits, and the plan itself. */

const CLARIFY_KEYWORDS: [RegExp, keyof AssistantCopy["clarifications"]][] = [
  [/refund|pengembalian|retur/i, "refund"],
  [/payment|pembayaran|bayar|checkout/i, "payment"],
  [/auth|login|sign[- ]?in|masuk|google|oauth|sso/i, "auth"],
  [/\brole|peran|permission|hak akses/i, "roles"],
];

export function clarificationFor(
  feature: string,
  copy: AssistantCopy,
): [string, Clarification] | null {
  const hit = CLARIFY_KEYWORDS.find(([re]) => re.test(feature));
  return hit ? [hit[1], copy.clarifications[hit[1]]] : null;
}

const UNDECIDED = /^(not decided|belum ditentukan|unknown|tidak tahu)/i;

export function pickAgent(
  task: { title: string; description?: string | null; phase?: string | null },
  ctx: AssistantContext,
  labels: PlannerLabels,
) {
  const agents = (ctx.agents ?? []).map((a) => ({ ...a }));
  const best = selectAgent({
    required: inferRequiredCapabilities(task),
    agents,
    load: ctx.agentLoad,
    preferredType: ctx.access.project.preferredAgent as AgentType | null,
    executableTypes: labels.executableTypes as never,
  });
  return best?.agent ?? null;
}

/** Feature request → requirement, optional rule from the clarification, PRD section, tasks, agent. */
export function featurePlan(
  feature: string,
  answer: string | undefined,
  clar: Clarification | null,
  ctx: AssistantContext,
  copy: AssistantCopy,
  labels: PlannerLabels,
): PlanOutcome {
  const req = copy.plan.featureRequirement(feature);
  const impl = copy.plan.implementationTask(feature);
  const qa = copy.plan.qaTask(feature);
  const detail = clar && answer ? `${clar.requirementTitle}: ${answer}` : "";
  const actions: PlannedAction[] = [
    {
      type: "CREATE_REQUIREMENT",
      key: "r1",
      payload: { group: "features", ...req, priority: "medium", status: "confirmed" },
    },
  ];
  if (clar && answer)
    actions.push({
      type: "CREATE_REQUIREMENT",
      key: "r2",
      payload: {
        group: clar.group,
        title: clar.requirementTitle,
        description: answer,
        priority: "medium",
        // "Not decided" stays an open question instead of becoming a confirmed rule.
        status: UNDECIDED.test(answer) ? "unknown" : "confirmed",
      },
    });
  actions.push(
    { type: "APPEND_PRD", key: "p1", payload: copy.plan.prdSection(feature, detail) },
    {
      type: "CREATE_TASK",
      key: "t1",
      payload: { ...impl, priority: "high", status: "todo", milestoneId: null },
    },
    {
      type: "CREATE_TASK",
      key: "t2",
      payload: { ...qa, priority: "medium", status: "todo", milestoneId: null },
    },
  );
  const agent = pickAgent(impl, ctx, labels);
  if (agent)
    actions.push({
      type: "ASSIGN_AGENT",
      key: "a1",
      optional: true,
      skip: false,
      payload: {
        task: { step: "t1" },
        agentId: agent.id,
        instructions: copy.plan.instructions(impl.title),
      },
    });
  return act(copy.proposals.addFeature(feature), copy.proposals.describeFeature, actions);
}
