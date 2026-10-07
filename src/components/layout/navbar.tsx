import { useLocale, useTranslations } from "next-intl";
import { Container } from "@/components/primitives/container";
import { Logo } from "@/components/primitives/logo";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";
import { MobileNav } from "./mobile-nav";
import { NAV_LINKS, type ResolvedNavLink } from "./nav-links";

export function Navbar() {
  const t = useTranslations("common");
  const locale = useLocale();
  const links: ResolvedNavLink[] = NAV_LINKS.map((l) => ({
    href: `/${locale}#${l.hash}`,
    label: t(`nav.${l.key}`),
    storyTarget: "storyTarget" in l ? l.storyTarget : undefined,
  }));

  return (
    <header className="nav-shell sticky top-0 z-40 border-b border-border bg-background/95">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-sm"
          aria-label={t("home")}
        >
          <Logo />
        </Link>
        <nav aria-label={t("primaryNav")} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  data-story-target={link.storyTarget}
                  className="rounded-sm px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:block" />
          <Link
            href="/start"
            className={buttonVariants({ size: "sm", className: "hidden sm:inline-flex" })}
          >
            {t("startProject")}
          </Link>
          <MobileNav
            links={links}
            labels={{
              open: t("openMenu"),
              close: t("closeMenu"),
              nav: t("mobileNav"),
              start: t("startProject"),
            }}
          />
        </div>
      </Container>
    </header>
  );
}
