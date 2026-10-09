/**
 * Project navigation. Simple mode shows the business view of a project; advanced sections
 * (marked `advanced`) add the technical areas. Mode is presentation only: every page still
 * checks access on the server.
 */
export const PROJECT_NAV = [
  {
    group: null,
    advanced: false,
    items: [
      { key: "overview", path: "" },
      { key: "assistant", path: "/assistant" },
      { key: "approvals", path: "/approvals" },
    ],
  },
  {
    group: "business",
    advanced: false,
    items: [
      { key: "progress", path: "/progress" },
      { key: "features", path: "/features" },
      { key: "documents", path: "/documents" },
      { key: "billing", path: "/billing" },
    ],
  },
  {
    group: "understand",
    advanced: true,
    items: [
      { key: "interview", path: "/interview" },
      { key: "requirements", path: "/requirements" },
    ],
  },
  {
    group: "plan",
    advanced: true,
    items: [
      { key: "prd", path: "/prd" },
      { key: "plan", path: "/plan" },
      { key: "tasks", path: "/tasks" },
    ],
  },
  {
    group: "context",
    advanced: true,
    items: [
      { key: "memory", path: "/memory" },
      { key: "decisions", path: "/decisions" },
    ],
  },
  {
    group: "build",
    advanced: true,
    items: [
      { key: "agents", path: "/agents" },
      { key: "integrations", path: "/integrations" },
    ],
  },
  {
    group: null,
    advanced: false,
    items: [
      { key: "activity", path: "/activity" },
      { key: "settings", path: "/settings" },
    ],
  },
] as const;

export type ProjectNavKey = (typeof PROJECT_NAV)[number]["items"][number]["key"];
