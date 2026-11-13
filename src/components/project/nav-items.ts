/** Project navigation. Mode is presentation only: every page still checks access on the server. */
export const PROJECT_NAV = [
  {
    group: null,
    items: [
      { key: "overview", path: "" },
      { key: "billing", path: "/billing" },
      { key: "documents", path: "/documents" },
    ],
  },
  {
    group: "more",
    items: [
      { key: "maintenance", path: "/maintenance" },
      { key: "meetings", path: "/meetings" },
      { key: "activity", path: "/activity" },
    ],
  },
  {
    group: null,
    items: [{ key: "settings", path: "/settings" }],
  },
] as const;

export type ProjectNavKey = (typeof PROJECT_NAV)[number]["items"][number]["key"];
