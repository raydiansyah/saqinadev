/** Project navigation, grouped the way work flows: understand → plan → context → build. */
export const PROJECT_NAV = [
  { group: null, items: [{ key: "overview", path: "" }] },
  {
    group: "understand",
    items: [
      { key: "interview", path: "/interview" },
      { key: "requirements", path: "/requirements" },
    ],
  },
  {
    group: "plan",
    items: [
      { key: "prd", path: "/prd" },
      { key: "plan", path: "/plan" },
      { key: "tasks", path: "/tasks" },
    ],
  },
  {
    group: "context",
    items: [
      { key: "memory", path: "/memory" },
      { key: "decisions", path: "/decisions" },
      { key: "documents", path: "/documents" },
    ],
  },
  { group: "build", items: [{ key: "agents", path: "/agents" }] },
  {
    group: null,
    items: [
      { key: "activity", path: "/activity" },
      { key: "settings", path: "/settings" },
    ],
  },
] as const;

export type ProjectNavKey = (typeof PROJECT_NAV)[number]["items"][number]["key"];
