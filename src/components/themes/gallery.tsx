import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import { Container } from "@/components/primitives/container";
import { buttonVariants } from "@/components/ui/button";
import {
  THEME_CATEGORIES,
  THEME_TIER,
  THEME_TIERS,
  type ThemeTier,
  type UiThemeId,
} from "@/content/ui-themes";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { getEngineCopy } from "@/lib/interview/copy";
import { cn } from "@/lib/utils";
import { ThemePreview } from "./theme-preview";

/** Tier is shown as text, never as colour alone. */
const TIER_STYLE: Record<ThemeTier, string> = {
  recommended: "border-primary text-primary",
  available: "border-border-strong text-foreground",
  concept: "border-border text-muted-foreground",
};

export function TierBadge({ tier, label }: { tier: ThemeTier; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-sm border px-2 py-0.5 font-mono text-xs",
        TIER_STYLE[tier],
      )}
    >
      {label}
    </span>
  );
}

export async function ThemesHero({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "themes.hero" });
  return (
    <section aria-labelledby="themes-hero-heading" className="pt-12 pb-12 sm:pt-20 sm:pb-16">
      <Container className="max-w-4xl">
        <h1
          id="themes-hero-heading"
          className="intro text-balance text-[2.25rem] leading-[1.08] font-semibold tracking-tight sm:text-5xl"
        >
          {t("title")}
        </h1>
        <p
          className="intro mt-5 max-w-2xl text-pretty text-lg text-muted-foreground"
          style={{ "--d": "150ms" } as CSSProperties}
        >
          {t("description")}
        </p>
        <div
          className="intro mt-8 flex flex-col gap-3 sm:flex-row"
          style={{ "--d": "300ms" } as CSSProperties}
        >
          <a href="#gallery" className={buttonVariants({ size: "lg" })}>
            {t("explore")}
          </a>
          <Link href="/start" className={buttonVariants({ size: "lg", variant: "outline" })}>
            {t("start")}
          </Link>
        </div>
      </Container>
    </section>
  );
}

export async function ThemeGallery({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "themes" });
  const copy = getEngineCopy(locale);

  const card = (id: UiThemeId) => {
    const theme = copy.themes[id];
    const tier = THEME_TIER[id];
    return (
      <li key={id} id={`theme-${id}`} className="flex scroll-mt-24">
        <article className="flex w-full flex-col gap-4 rounded-lg border border-border bg-surface p-4">
          <ThemePreview theme={id} />
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-medium">{theme.name}</h3>
            <TierBadge tier={tier} label={copy.themeTiers[tier].label} />
          </div>
          <p className="text-sm text-pretty text-muted-foreground">{theme.summary}</p>
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground hover:text-foreground">
              {t("card.dashboard")}
            </summary>
            <ThemePreview theme={id} variant="dashboard" className="mt-2" />
          </details>
          <p className="mt-auto text-xs text-subtle-foreground">
            {t("card.bestFor", { value: theme.bestFor })}
          </p>
        </article>
      </li>
    );
  };

  return (
    <section
      id="gallery"
      aria-label={t("hero.explore")}
      className="scroll-mt-20 border-t border-border"
    >
      <Container className="py-12 sm:py-16">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="font-mono text-xs text-primary">{t("tiers.title")}</p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              {THEME_TIERS.map((tier) => (
                <div key={tier}>
                  <dt>
                    <TierBadge tier={tier} label={copy.themeTiers[tier].label} />
                  </dt>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    {copy.themeTiers[tier].hint}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <nav aria-label={t("categoriesNav")} className="mt-8 flex flex-wrap gap-2">
          {THEME_CATEGORIES.map((c) => (
            <a
              key={c.id}
              href={`#category-${c.id}`}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {copy.themeCategories[c.id]}
            </a>
          ))}
        </nav>

        <div className="mt-12 space-y-16">
          {THEME_CATEGORIES.map((c) => (
            <section
              key={c.id}
              id={`category-${c.id}`}
              aria-labelledby={`category-${c.id}-heading`}
              className="scroll-mt-24"
            >
              <h2
                id={`category-${c.id}-heading`}
                className="mb-6 text-2xl font-semibold tracking-tight"
              >
                {copy.themeCategories[c.id]}
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {c.themes.map((id) => card(id))}
              </ul>
            </section>
          ))}
        </div>
      </Container>
    </section>
  );
}

export async function ThemesClosing({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "themes" });
  return (
    <section aria-labelledby="themes-cta-heading" className="border-t border-border py-16 sm:py-24">
      <Container className="grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t("note.title")}</h2>
          <p className="mt-3 max-w-xl text-pretty text-muted-foreground">{t("note.body")}</p>
        </div>
        <div>
          <h2 id="themes-cta-heading" className="text-xl font-semibold tracking-tight">
            {t("cta.title")}
          </h2>
          <p className="mt-3 max-w-xl text-pretty text-muted-foreground">{t("cta.description")}</p>
          <Link href="/start" className={cn(buttonVariants({ size: "lg" }), "mt-6")}>
            {t("cta.start")}
          </Link>
        </div>
      </Container>
    </section>
  );
}
