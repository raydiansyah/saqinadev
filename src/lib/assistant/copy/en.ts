import type { AssistantCopy } from "./types";

export const en: AssistantCopy = {
  help: [
    "I work on this project's workspace. You can ask me to:",
    "- answer questions about the project, PRD, tasks, requirements and decisions",
    "- create or update tasks, memory and decisions",
    "- add features or roles (I propose the requirement, PRD and task changes first)",
    "- analyse the PRD, requirements or blocked tasks",
    "- assign a task to an agent",
  ].join("\n"),
  viewerForbidden:
    "You have view access to this project, so I can answer questions but not change anything.",
  needsTask: "Which task do you mean? Open it first or ask from the task itself.",
  needsTitle: "What should the task be called?",
  needsPriority: "Which priority should it get?",
  pendingApprovals: (n) =>
    n === 0 ? "Nothing is waiting for your approval." : `${n} proposal(s) wait for your approval.`,
  needsFeature: "Which feature should I add?",
  noAgent: "No agent in this project has the skills for that task.",
  executed: (n) => (n === 1 ? "Done. 1 change applied." : `Done. ${n} changes applied.`),
  proposalIntro:
    "This changes project content, so it waits for your approval. Nothing is applied yet.",
  proposalDestructive:
    "This deletes data, so it needs your approval. Review every item before approving.",
  revisionAsk: (title, note) =>
    `Noted. What should change in "${title}"?${note ? ` You said: ${note}` : ""} Tell me and I will prepare a new proposal.`,
  modelFallback: "The language model was unavailable, so this answer comes from project data only.",

  project: (p) =>
    [
      `${p.name} is in ${p.status}.`,
      `${p.requirements} requirements (${p.open} still open), ${p.tasks} tasks (${p.done} done, ${p.blocked} blocked).`,
      p.pending ? `${p.pending} proposal(s) wait for your review.` : "",
      `Next step: ${p.next}.`,
    ]
      .filter(Boolean)
      .join(" "),

  decision: {
    found: (n, q, s, r) =>
      `Decision #${String(n).padStart(3, "0")}: "${q}" Chosen: ${s}. Reason recorded: ${r}`,
    recommendation: (k, v, r) => `The ${k} recommendation is ${v}. ${r}`,
    memory: (t, c) => `Project memory "${t}": ${c}`,
    unknown: (topic) =>
      `I can't find a recorded decision or recommendation about ${topic}. I won't guess a reason; you can record one as a decision.`,
    list: (n) => `This project has ${n} recorded decision(s).`,
  },

  analysis: {
    prdTitle: "PRD review",
    requirementsTitle: "Requirements review",
    tasksTitle: "Task review",
    projectTitle: "Project review",
    unknownRequirement: (t) => `"${t}" is still unknown.`,
    conflictingRequirement: (t) => `"${t}" has conflicting answers.`,
    inferredRequirement: (t) => `"${t}" was inferred and not confirmed by you.`,
    prdMissing: (t) => `Requirement "${t}" is not mentioned in the PRD.`,
    prdPlaceholder: (h) => `PRD section "${h}" is empty or still a placeholder.`,
    prdNotApproved: "The PRD is not approved yet.",
    noPrd: "This project has no PRD yet.",
    taskBlocked: (t) => `"${t}" is blocked.`,
    taskStale: (t, d) => `"${t}" has been in progress for ${d} days without an update.`,
    taskInReview: (t) => `"${t}" is waiting for review.`,
    noIssues: "I found no issues in the project data.",
    found: (n) => (n === 1 ? "I found 1 item to look at." : `I found ${n} items to look at.`),
    recommendResolve: "Resolve the open and conflicting requirements before building on them.",
    recommendUnblock: "Unblock these tasks first: blocked work holds up everything after it.",
    recommendApprovePrd: "Review and approve the PRD so the plan rests on agreed scope.",
  },

  task: {
    summary: (t) =>
      `"${t.title}" is ${t.status} with ${t.priority} priority.${t.description ? ` ${t.description}` : " It has no description yet."}`,
    priorityNames: { critical: "critical", high: "high", medium: "medium", low: "low" },
    statusNames: {
      backlog: "in the backlog",
      todo: "to do",
      in_progress: "in progress",
      review: "in review",
      done: "done",
      blocked: "blocked",
    },
  },

  memory: {
    list: (n) => `Project memory holds ${n} item(s). The most recent:`,
    empty: "Project memory is empty.",
    titleFrom: (text) => (text.length > 60 ? `${text.slice(0, 57)}...` : text),
    category: "product",
  },

  plan: {
    featureRequirement: (f) => ({
      title: f,
      description: `Users can use ${f}. Added from a conversation with Saqina.`,
    }),
    prdSection: (f, detail) => ({
      heading: f,
      body: `- Add ${f} to the product scope.${detail ? `\n- ${detail}` : ""}\n- Acceptance: the feature works end to end and is covered by tests.`,
    }),
    implementationTask: (f) => ({
      title: `Implement ${f}`,
      description: `Build ${f} according to the PRD section of the same name.`,
    }),
    qaTask: (f) => ({
      title: `Test ${f}`,
      description: `Write and run tests for ${f}: main flow, errors and permissions.`,
    }),
    subtasks: (t) => [`${t}: design`, `${t}: implementation`, `${t}: tests`, `${t}: documentation`],
    planTasks: (f) => [
      { title: `Define scope for ${f}`, description: `Agree what ${f} must and must not do.` },
      { title: `Design ${f}`, description: `Screens, data and states for ${f}.` },
      { title: `Implement ${f}`, description: `Build ${f} following the design.` },
      { title: `Test ${f}`, description: `Cover the main flow, errors and permissions.` },
    ],
    roleRequirement: (r) => ({
      title: `Role: ${r}`,
      description: `A ${r} role with its own permissions. Exact permissions still to be confirmed.`,
    }),
    decisionReason: "Recorded from a conversation with Saqina.",
    instructions: (t) =>
      `Work on "${t}" using the project PRD and requirements. Propose changes; do not apply them.`,
  },

  proposals: {
    addFeature: (f) => `Add ${f}`,
    addRole: (r) => `Add the ${r} role`,
    deleteTasks: (n) => `Delete ${n} task(s)`,
    updateRequirement: (t) => `Update requirement "${t}"`,
    splitTask: (t) => `Split "${t}" into subtasks`,
    plan: (f) => `Implementation plan for ${f}`,
    assign: (t, a) => `Assign "${t}" to ${a}`,
    describeFeature: "Adds a requirement, a PRD section and tasks for implementation and testing.",
    describeDelete: "Permanently deletes the tasks listed below. This cannot be undone.",
    describeRequirement: "Changes an existing requirement. The old value is shown for comparison.",
    describeAssign: "Hands the task to an agent. The run is simulated in this phase.",
    agentResult: (a, t) => `${a} result for "${t}"`,
  },

  clarifications: {
    refund: {
      question: "Does a refund need a manager's approval?",
      options: [
        "Cashier can refund without approval",
        "Always needs manager approval",
        "Depends on the transaction amount",
        "Not decided yet",
      ],
      requirementTitle: "Refund approval",
      group: "business_rules",
    },
    payment: {
      question: "Which payment methods must be supported first?",
      options: ["Bank transfer", "E-wallet and QRIS", "Credit card", "Not decided yet"],
      requirementTitle: "Payment methods",
      group: "business_rules",
    },
    auth: {
      question: "Who should be able to sign in this way?",
      options: ["All users", "Staff only", "Customers only", "Not decided yet"],
      requirementTitle: "Sign-in audience",
      group: "authentication",
    },
    roles: {
      question: "Can this role change other users' data?",
      options: ["Yes, within their team", "Read only", "Only their own data", "Not decided yet"],
      requirementTitle: "Role permissions",
      group: "users_roles",
    },
  },
  requirementUpdate: {
    question: (t) => `What should change in "${t}"?`,
    noMatch: (topic) =>
      `I can't find a requirement about ${topic}. Check the Requirements page for the exact name.`,
  },

  agent: {
    summary: (role, t) =>
      `${role} reviewed "${t}" against the PRD and requirements and prepared the changes below.`,
    failedSummary: "The run could not finish.",
    unavailable:
      "Execution environment unavailable: this agent is not connected to Saqina yet, so nothing was run.",
    simulated:
      "Simulated run: Saqina prepared this from project data. No code, repository or deployment was touched.",
    memoryTitle: (t) => `QA checklist: ${t}`,
    checklist: (t) =>
      [
        `- Main flow of "${t}" works`,
        "- Errors show a clear message",
        "- Permissions are enforced",
        "- Works on mobile",
      ].join("\n"),
    roleTasks: {
      planner: (t) => [`${t}: confirm scope`, `${t}: break down work`],
      frontend: (t) => [`${t}: UI states (loading, empty, error)`, `${t}: accessibility check`],
      backend: (t) => [`${t}: API and validation`, `${t}: authorization checks`],
      qa: (t) => [`${t}: regression tests`],
      docs: (t) => [`${t}: user documentation`],
      general: (t) => [`${t}: follow-up`],
    },
    issues: {
      noPrd: "The project has no PRD, so the agent worked from the task only.",
      noRequirements: "No requirements matched this task.",
    },
    recommendation: "Review the proposed changes, then approve or request a revision.",
  },
};
