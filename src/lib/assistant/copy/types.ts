import type { MemoryCategory, RequirementGroup } from "@/lib/domain/enums";
import type { BusinessCopy } from "./business";

/** A question Saqina asks before acting, with answers the user can tap. */
export interface Clarification {
  question: string;
  options: string[];
  /** Requirement written once the user answers. */
  requirementTitle: string;
  group: RequirementGroup;
}

/** Strings the assistant writes into conversations and generated changes. */
export interface AssistantCopy {
  help: string;
  viewerForbidden: string;
  needsTask: string;
  needsTitle: string;
  needsPriority: string;
  pendingApprovals: (count: number) => string;
  needsFeature: string;
  noAgent: string;
  executed: (count: number) => string;
  proposalIntro: string;
  proposalDestructive: string;
  revisionAsk: (title: string, note: string) => string;
  modelFallback: string;
  business: BusinessCopy;

  project: (p: {
    name: string;
    status: string;
    next: string;
    requirements: number;
    open: number;
    tasks: number;
    done: number;
    blocked: number;
    pending: number;
  }) => string;

  decision: {
    found: (number: number, question: string, selected: string, reason: string) => string;
    recommendation: (key: string, value: string, reason: string) => string;
    memory: (title: string, content: string) => string;
    unknown: (topic: string) => string;
    list: (count: number) => string;
  };

  analysis: {
    prdTitle: string;
    requirementsTitle: string;
    tasksTitle: string;
    projectTitle: string;
    unknownRequirement: (title: string) => string;
    conflictingRequirement: (title: string) => string;
    inferredRequirement: (title: string) => string;
    prdMissing: (title: string) => string;
    prdPlaceholder: (heading: string) => string;
    prdNotApproved: string;
    noPrd: string;
    taskBlocked: (title: string) => string;
    taskStale: (title: string, days: number) => string;
    taskInReview: (title: string) => string;
    noIssues: string;
    found: (count: number) => string;
    recommendResolve: string;
    recommendUnblock: string;
    recommendApprovePrd: string;
  };

  task: {
    summary: (t: {
      title: string;
      status: string;
      priority: string;
      description: string;
    }) => string;
    priorityNames: Record<string, string>;
    statusNames: Record<string, string>;
  };

  memory: {
    list: (count: number) => string;
    empty: string;
    titleFrom: (text: string) => string;
    category: MemoryCategory;
  };

  plan: {
    featureRequirement: (feature: string) => { title: string; description: string };
    prdSection: (feature: string, detail: string) => { heading: string; body: string };
    implementationTask: (feature: string) => { title: string; description: string };
    qaTask: (feature: string) => { title: string; description: string };
    subtasks: (title: string) => string[];
    planTasks: (feature: string) => { title: string; description: string }[];
    roleRequirement: (role: string) => { title: string; description: string };
    decisionReason: string;
    instructions: (task: string) => string;
  };

  proposals: {
    addFeature: (feature: string) => string;
    addRole: (role: string) => string;
    deleteTasks: (count: number) => string;
    updateRequirement: (title: string) => string;
    splitTask: (title: string) => string;
    plan: (feature: string) => string;
    assign: (task: string, agent: string) => string;
    describeFeature: string;
    describeDelete: string;
    describeRequirement: string;
    describeAssign: string;
    agentResult: (agent: string, task: string) => string;
  };

  clarifications: Record<"refund" | "payment" | "auth" | "roles", Clarification>;
  requirementUpdate: { question: (title: string) => string; noMatch: (topic: string) => string };

  repository: {
    title: string;
    notConnected: string;
    summary: (name: string, branch: string, head: string) => string;
    readNow: string;
    readFailed: (code: string) => string;
    detected: (key: string, value: string) => string;
    intended: (key: string, value: string) => string;
    mismatch: (key: string, project: string, repo: string) => string;
    mismatchFound: (n: number) => string;
    noMismatch: string;
    resolveHint: string;
  };
  handoff: {
    needsTask: string;
    unknownAgent: (name: string, list: string) => string;
    title: (agent: string, task: string) => string;
    describe: string;
  };

  agent: {
    summary: (role: string, task: string) => string;
    handoffReady: (agent: string) => string;
    handoffSent: (agent: string) => string;
    failedSummary: string;
    unavailable: string;
    simulated: string;
    memoryTitle: (task: string) => string;
    checklist: (task: string) => string;
    roleTasks: Record<string, (task: string) => string[]>;
    issues: { noPrd: string; noRequirements: string };
    recommendation: string;
  };
}
