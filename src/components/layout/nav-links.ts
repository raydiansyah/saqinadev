/** Section links shared by the navbar, mobile menu and footer. Labels come from messages. */
export const NAV_LINKS = [
  { key: "product", hash: "product" },
  { key: "howItWorks", hash: "how-it-works" },
  // The agents chapter sits inside the pinned story, so the story controller handles the jump.
  { key: "agents", hash: "chapter-agents", storyTarget: "agents" },
  { key: "useCases", hash: "use-cases" },
] as const;

export type NavKey = (typeof NAV_LINKS)[number]["key"];

export interface ResolvedNavLink {
  href: string;
  label: string;
  storyTarget?: string;
}
