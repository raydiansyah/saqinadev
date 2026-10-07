import { useLocale, useTranslations } from "next-intl";
import { Container } from "@/components/primitives/container";
import { Logo } from "@/components/primitives/logo";
import { getSiteContent } from "@/content/site";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";
import { NAV_LINKS } from "./nav-links";

const LINK =
  "inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground";

export function Footer() {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const { footer } = getSiteContent(locale);

  return (
    <footer className="border-t border-border py-12">
      <Container className="grid gap-10 md:grid-cols-[minmax(0,1fr)_auto_auto] md:gap-16">
        <div>
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {footer.tagline.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
          <p className="mt-6 font-mono text-xs text-subtle-foreground">
            {t("footer.phase")} · © {new Date().getFullYear()} Saqina Dev
          </p>
        </div>
        <nav aria-label={t("footerNav")}>
          <ul className="space-y-1">
            {NAV_LINKS.map((l) => (
              <li key={l.key}>
                <a
                  href={`/${locale}#${l.hash}`}
                  data-story-target={"storyTarget" in l ? l.storyTarget : undefined}
                  className={LINK}
                >
                  {t(`nav.${l.key}`)}
                </a>
              </li>
            ))}
            <li className="inline-flex min-h-11 items-center gap-2 text-sm text-subtle-foreground">
              {t("footer.documentation")}{" "}
              <span className="font-mono text-xs">{t("footer.comingSoon")}</span>
            </li>
          </ul>
        </nav>
        <div>
          <p className="font-mono text-xs text-subtle-foreground">{t("footer.legal")}</p>
          <ul className="mt-1 space-y-1">
            <li>
              <Link href="/privacy" className={LINK}>
                {t("footer.privacy")}
              </Link>
            </li>
            <li>
              <Link href="/terms" className={LINK}>
                {t("footer.terms")}
              </Link>
            </li>
            <li>
              <Link
                href="/start"
                className="inline-flex min-h-11 items-center text-sm text-primary hover:underline"
              >
                {t("startProject")}
              </Link>
            </li>
          </ul>
          <LanguageSwitcher className="mt-4 -ml-2" />
        </div>
      </Container>
    </footer>
  );
}
