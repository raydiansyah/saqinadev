/** Section links shared by the navbar, mobile menu and footer. Labels come from messages. */
export const NAV_LINKS = [
  { key: "product", hash: "product" },
  { key: "howItWorks", hash: "how-it-works" },
  { key: "try", hash: "try" },
] as const;

export type NavKey = (typeof NAV_LINKS)[number]["key"];

export interface ResolvedNavLink {
  href: string;
  label: string;
}
