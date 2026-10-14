/** Links shared by the navbar, mobile menu and footer. Labels come from messages. */
export const NAV_LINKS = [
  { key: "product", hash: "product" },
  { key: "howItWorks", hash: "how-it-works" },
  { key: "try", hash: "try" },
  { key: "services", path: "/services" },
] as const;

export type NavKey = (typeof NAV_LINKS)[number]["key"];

export interface ResolvedNavLink {
  href: string;
  label: string;
}

/** Section links point at the landing page hash; path links at their own localized page. */
export function navHref(link: (typeof NAV_LINKS)[number], locale: string): string {
  return "path" in link ? `/${locale}${link.path}` : `/${locale}#${link.hash}`;
}
