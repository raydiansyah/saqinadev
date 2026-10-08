import type { PlannedAction } from "./actions/types";
import { analyzePrd, analyzeRequirements, analyzeTasks, explainChoice } from "./analysis";
import type { Block, Finding } from "./blocks";
import type { AssistantContext } from "./context-builder";
import type { AssistantCopy, Clarification } from "./copy/types";
import { clarificationFor, featurePlan, pickAgent } from "./feature-plan";
import type { IntentClassification, PendingIntent } from "./intents/types";

/**
 * Turns an intent plus project context into an outcome. Pure: it reads the loaded context and
 * returns what should happen; the service decides whether actions run now or wait for approval.
 */

export type PlanOutcome =
  | { kind: "answer"; draft: string; blocks: Block[] }
  | { kind: "clarify"; draft: string; options: string[]; pending: PendingIntent }
  | { kind: "act"; draft: string; title: string; description: string; actions: PlannedAction[] };

export interface PlannerLabels {
  status: string;
  next: string;
  executableTypes: readonly string[];
}

const NOT_STARTED = new Set(["backlog", "todo"]);

function answer(draft: string, blocks: Block[] = []): PlanOutcome {
  return { kind: "answer", draft, blocks };
}

function analysis(
  title: string,
  findings: Finding[],
  copy: AssistantCopy,
  recommendation?: string,
): PlanOutcome {
  const draft = findings.length ? copy.analysis.found(findings.length) : copy.analysis.noIssues;
  return answer(draft, [
    {
      type: "analysis",
      title,
      findings,
      recommendation: findings.length ? recommendation : undefined,
    },
  ]);
}

function clarify(
  c: IntentClassification,
  question: string,
  key: string,
  options: string[] = [],
): PlanOutcome {
  return {
    kind: "clarify",
    draft: question,
    options,
    pending: { intent: c.intent, entities: c.entities, question: key },
  };
}

export function plan(
  c: IntentClassification,
  ctx: AssistantContext,
  copy: AssistantCopy,
  labels: PlannerLabels,
): PlanOutcome {
  const base = `/project/${ctx.access.project.slug}`;
  const href = {
    prd: `${base}/prd`,
    requirements: `${base}/requirements`,
    decisions: `${base}/decisions`,
    plan: `${base}/plan`,
    memory: `${base}/memory`,
    approvals: `${base}/approvals`,
    task: (id: string) => `${base}/tasks?task=${id}`,
  };
  const e = c.entities;
  const task = ctx.entity.type === "task" ? ctx.entity.task : null;
  const s = ctx.snapshot;

  switch (c.intent) {
    case "HELP":
      return answer(copy.help);

    case "ASK_PROJECT": {
      const reqs = ctx.requirements ?? [];
      const total = Object.values(s.tasks).reduce((a, b) => a + b, 0);
      return answer(
        copy.project({
          name: ctx.access.project.name,
          status: labels.status,
          next: labels.next,
          requirements: reqs.length,
          open: reqs.filter((r) => r.status === "unknown" || r.status === "conflicting").length,
          tasks: total,
          done: s.tasks.done,
          blocked: s.tasks.blocked,
          pending: s.attention?.pendingProposals ?? 0,
        }),
      );
    }

    case "ASK_TASK": {
      if (!task) return answer(copy.needsTask);
      return answer(
        copy.task.summary({
          title: task.title,
          status: copy.task.statusNames[task.status] ?? task.status,
          priority: copy.task.priorityNames[task.priority] ?? task.priority,
          description: task.description,
        }),
      );
    }

    case "ASK_REQUIREMENT":
    case "ANALYZE_REQUIREMENTS":
      return analysis(
        copy.analysis.requirementsTitle,
        analyzeRequirements(ctx.requirements ?? [], copy, href.requirements),
        copy,
        copy.analysis.recommendResolve,
      );

    case "ASK_PRD":
    case "ANALYZE_PRD":
    case "GENERATE_PRD":
      return analysis(
        copy.analysis.prdTitle,
        analyzePrd(ctx.prd, ctx.requirements ?? [], copy, href),
        copy,
        copy.analysis.recommendApprovePrd,
      );

    case "ANALYZE_TASKS":
      return analysis(
        copy.analysis.tasksTitle,
        analyzeTasks(ctx.tasks ?? [], copy, href.task, { onlyBlocked: e.target === "blocked" }),
        copy,
        copy.analysis.recommendUnblock,
      );

    case "ANALYZE_PROJECT":
      return analysis(
        copy.analysis.projectTitle,
        [
          ...analyzeRequirements(ctx.requirements ?? [], copy, href.requirements),
          ...analyzePrd(ctx.prd, ctx.requirements ?? [], copy, href),
          ...analyzeTasks(ctx.tasks ?? [], copy, href.task),
        ].slice(0, 20),
        copy,
        copy.analysis.recommendResolve,
      );

    case "ASK_DECISION": {
      const decisions = ctx.decisions ?? [];
      if (!e.topic && ctx.entity.type === "decision") {
        const d = ctx.entity.decision;
        return answer(copy.decision.found(d.number, d.question, d.selected, d.reason));
      }
      if (!e.topic)
        return answer(copy.decision.list(decisions.length), [
          {
            type: "analysis",
            title: copy.decision.list(decisions.length),
            findings: decisions.slice(0, 5).map((d) => ({
              label: "confirmed" as const,
              text: copy.decision.found(d.number, d.question, d.selected, d.reason),
              href: href.decisions,
            })),
          },
        ]);
      const findings = explainChoice(
        e.topic,
        { decisions, recommendations: ctx.recommendations ?? [], memories: ctx.memories ?? [] },
        copy,
        { decisions: href.decisions, plan: href.plan, memory: href.memory },
      );
      return answer(findings[0].text, [{ type: "analysis", title: e.topic, findings }]);
    }

    case "ASK_MEMORY": {
      const items = ctx.memories ?? [];
      if (!items.length) return answer(copy.memory.empty);
      return answer(copy.memory.list(items.length), [
        {
          type: "analysis",
          title: copy.memory.list(items.length),
          findings: items.slice(0, 5).map((m) => ({
            label: "confirmed" as const,
            text: `${m.title}: ${m.content}`,
            href: href.memory,
          })),
        },
      ]);
    }

    case "REQUEST_APPROVAL": {
      const n = s.attention?.pendingProposals ?? 0;
      return answer(copy.pendingApprovals(n), [
        {
          type: "analysis",
          title: copy.pendingApprovals(n),
          findings: n
            ? [{ label: "confirmed", text: copy.pendingApprovals(n), href: href.approvals }]
            : [],
        },
      ]);
    }

    case "CREATE_TASK": {
      if (!e.title) return clarify(c, copy.needsTitle, "title");
      return act(copy.proposals.plan(e.title), "", [
        {
          type: "CREATE_TASK",
          key: "t1",
          payload: {
            title: e.title,
            description: e.description ?? "",
            priority: e.priority ?? "medium",
            status: "todo",
            milestoneId: null,
          },
        },
      ]);
    }

    case "UPDATE_TASK":
    case "COMPLETE_TASK": {
      if (!task) return answer(copy.needsTask);
      if (c.intent === "UPDATE_TASK" && !e.priority)
        return clarify(c, copy.needsPriority, "priority", Object.values(copy.task.priorityNames));
      return act(task.title, "", [
        {
          type: "UPDATE_TASK",
          key: "t1",
          payload:
            c.intent === "COMPLETE_TASK"
              ? { id: task.id, status: "done" }
              : { id: task.id, priority: e.priority },
          before: { title: task.title, priority: task.priority, status: task.status },
        },
      ]);
    }

    case "DELETE_TASKS": {
      const targets =
        e.target === "all_not_started"
          ? (ctx.tasks ?? []).filter((t) => NOT_STARTED.has(t.status))
          : task
            ? [task]
            : null;
      if (!targets) return answer(copy.needsTask);
      if (!targets.length) return answer(copy.analysis.noIssues);
      return act(copy.proposals.deleteTasks(targets.length), copy.proposals.describeDelete, [
        ...targets.slice(0, 30).map((t, i) => ({
          type: "DELETE_TASK" as const,
          key: `d${i + 1}`,
          payload: { id: t.id },
          before: { title: t.title, status: t.status },
        })),
      ]);
    }

    case "SPLIT_TASK": {
      if (!task) return answer(copy.needsTask);
      return act(
        copy.proposals.splitTask(task.title),
        "",
        copy.plan.subtasks(task.title).map((title, i) => ({
          type: "CREATE_TASK" as const,
          key: `t${i + 1}`,
          payload: {
            title: title.slice(0, 200),
            description: "",
            priority: task.priority,
            status: "todo",
            milestoneId: task.milestoneId,
          },
        })),
      );
    }

    case "GENERATE_PLAN": {
      const feature = e.feature ?? e.topic;
      if (!feature) return clarify(c, copy.needsFeature, "feature");
      return act(
        copy.proposals.plan(feature),
        "",
        copy.plan.planTasks(feature).map((t, i) => ({
          type: "CREATE_TASK" as const,
          key: `t${i + 1}`,
          payload: {
            ...t,
            priority: "medium" as const,
            status: "todo" as const,
            milestoneId: null,
          },
        })),
      );
    }

    case "CREATE_REQUIREMENT": {
      const role = e.role ?? e.title;
      if (!role) return clarify(c, copy.needsFeature, "feature");
      const req = copy.plan.roleRequirement(role);
      return act(copy.proposals.addRole(role), copy.proposals.describeRequirement, [
        {
          type: "CREATE_REQUIREMENT",
          key: "r1",
          payload: { group: "users_roles", ...req, priority: "medium", status: "confirmed" },
        },
      ]);
    }

    case "UPDATE_REQUIREMENT": {
      const reqs = ctx.requirements ?? [];
      const target =
        ctx.entity.type === "requirement"
          ? ctx.entity.requirement
          : reqs.find((r) => r.id === e.title)
            ? reqs.find((r) => r.id === e.title)
            : e.topic
              ? (reqs.find((r) => r.title.toLowerCase().includes(e.topic?.toLowerCase() ?? "")) ??
                reqs.find((r) =>
                  r.description.toLowerCase().includes(e.topic?.toLowerCase() ?? ""),
                ))
              : undefined;
      if (!target) return answer(copy.requirementUpdate.noMatch(e.topic ?? "?"));
      if (!e.description)
        return clarify(
          { ...c, entities: { ...e, title: target.id } },
          copy.requirementUpdate.question(target.title),
          "requirement",
        );
      return act(
        copy.proposals.updateRequirement(target.title),
        copy.proposals.describeRequirement,
        [
          {
            type: "UPDATE_REQUIREMENT",
            key: "r1",
            payload: { id: target.id, description: e.description, status: "confirmed" },
            before: {
              title: target.title,
              description: target.description,
              priority: target.priority,
              status: target.status,
            },
          },
        ],
      );
    }

    case "UPDATE_PRD": {
      if (!e.description) return clarify(c, copy.needsFeature, "prd");
      const section = copy.plan.prdSection(
        e.feature ?? copy.memory.titleFrom(e.description),
        e.description,
      );
      return act(section.heading, "", [{ type: "APPEND_PRD", key: "p1", payload: section }]);
    }

    case "ADD_FEATURE": {
      const feature = e.feature;
      if (!feature) return clarify(c, copy.needsFeature, "feature");
      const clar = clarificationFor(feature, copy);
      if (clar && !e.description)
        return clarify(c, clar[1].question, `clarify:${clar[0]}`, clar[1].options);
      return featurePlan(feature, e.description, clar?.[1] ?? null, ctx, copy, labels);
    }

    case "CREATE_MEMORY": {
      if (!e.description) return clarify(c, copy.needsFeature, "memory");
      return act(copy.memory.titleFrom(e.description), "", [
        {
          type: "CREATE_MEMORY",
          key: "m1",
          payload: {
            title: copy.memory.titleFrom(e.description),
            content: e.description,
            category: copy.memory.category,
            importance: "normal",
          },
        },
      ]);
    }

    case "CREATE_DECISION": {
      if (!e.description) return clarify(c, copy.needsFeature, "decision");
      const text = e.description.slice(0, 160);
      return act(text, "", [
        {
          type: "CREATE_DECISION",
          key: "c1",
          payload: {
            question: e.description.length >= 5 ? e.description.slice(0, 300) : `${text}?`,
            context: "",
            options: [text],
            selected: text,
            reason: copy.plan.decisionReason,
          },
        },
      ]);
    }

    case "ASSIGN_AGENT":
    case "RUN_AGENT": {
      if (!task) return answer(copy.needsTask);
      const picked = pickAgent(task, ctx, labels);
      if (!picked) return answer(copy.noAgent);
      return act(copy.proposals.assign(task.title, picked.name), copy.proposals.describeAssign, [
        {
          type: "ASSIGN_AGENT",
          key: "a1",
          optional: false,
          skip: false,
          payload: {
            task: { id: task.id },
            agentId: picked.id,
            instructions: copy.plan.instructions(task.title),
          },
        },
      ]);
    }
  }
}

export function act(title: string, description: string, actions: PlannedAction[]): PlanOutcome {
  return { kind: "act", draft: "", title, description, actions };
}
