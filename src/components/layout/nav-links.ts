/** Links shared by the navbar, mobile menu and footer. Labels come from messages. */
export const NAV_LINKS = [{ key: "features", hash: "features" }] as const;

export type NavKey = (typeof NAV_LINKS)[number]["key"];

export interface ResolvedNavLink {
  href: string;
  label: string;
}

/** Section links point at the landing page hash; path links at their own localized page. */
export function navHref(link: (typeof NAV_LINKS)[number], locale: string): string {
  return `/${locale}#${link.hash}`;
}
