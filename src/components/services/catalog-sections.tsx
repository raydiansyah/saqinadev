import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import { Container } from "@/components/primitives/container";
import { Section } from "@/components/primitives/section";
import { buttonVariants } from "@/components/ui/button";
import type { PublicService } from "@/lib/services/public";
import { HeroVisual } from "./hero-visual";
import { ServiceCard } from "./service-card";

type Locale = "en" | "id";

export async function ServicesHero({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "services.hero" });
  return (
    <section aria-labelledby="services-hero-heading" className="pt-12 pb-16 sm:pt-20 sm:pb-24">
      <Container className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
        <div>
          <h1
            id="services-hero-heading"
            className="intro text-balance text-[2.25rem] leading-[1.08] font-semibold tracking-tight sm:text-5xl"
          >
            {t("title")}
          </h1>
          <p
            className="intro mt-5 max-w-xl text-pretty text-lg text-muted-foreground"
            style={{ "--d": "150ms" } as CSSProperties}
          >
            {t("description")}
          </p>
          <div
            className="intro mt-8 flex flex-col gap-3 sm:flex-row"
            style={{ "--d": "300ms" } as CSSProperties}
          >
            <a href="#catalog" className={buttonVariants({ size: "lg" })}>
              {t("explore")}
            </a>
            <a href="#inquiry" className={buttonVariants({ size: "lg", variant: "outline" })}>
              {t("discuss")}
            </a>
          </div>
        </div>
        <HeroVisual label={t("visualLabel")} />
      </Container>
    </section>
  );
}

function Grid({ items, locale }: { items: PublicService[]; locale: Locale }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((s) => (
        <li key={s.slug} className="flex">
          <ServiceCard service={s} locale={locale} className="w-full" />
        </li>
      ))}
    </ul>
  );
}

/** Featured row plus the full catalog; renders the empty state when nothing is published. */
export async function ServicesCatalog({
  services,
  locale,
}: {
  services: PublicService[];
  locale: Locale;
}) {
  const t = await getTranslations({ locale, namespace: "services" });
  const featured = services.filter((s) => s.isFeatured);

  if (services.length === 0) {
    return (
      <section
        id="catalog"
        aria-labelledby="catalog-heading"
        className="scroll-mt-20 border-t border-border py-20 sm:py-28"
      >
        <Container className="max-w-2xl">
          <h2 id="catalog-heading" className="text-2xl font-semibold tracking-tight">
            {t("empty.title")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("empty.body")}</p>
        </Container>
      </section>
    );
  }

  return (
    <>
      {featured.length > 0 ? (
        <Section
          id="featured"
          file="services/featured.md"
          title={t("featured.title")}
          intro={t("featured.intro")}
        >
          <Grid items={featured} locale={locale} />
        </Section>
      ) : null}
      <Section
        id="catalog"
        file="services/catalog.md"
        title={t("catalog.title")}
        intro={t("catalog.intro")}
        className="scroll-mt-20"
      >
        <Grid items={services} locale={locale} />
      </Section>
    </>
  );
}

export async function HowSaqinaHelps({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "services.how" });
  const steps = t.raw("steps") as { title: string; body: string }[];
  return (
    <Section id="how" file="services/process.md" title={t("title")} intro={t("intro")}>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="rounded-lg border border-border p-5">
            <span className="font-mono text-sm text-primary">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-3 text-lg font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export async function CustomSolutions({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "services.custom" });
  return (
    <section aria-labelledby="custom-heading" className="border-t border-border py-20 sm:py-28">
      <Container className="grid items-center gap-8 rounded-lg border border-border-strong bg-surface p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <h2 id="custom-heading" className="text-balance text-3xl font-semibold tracking-tight">
            {t("title")}
          </h2>
          <p className="mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">{t("body")}</p>
        </div>
        <a href="#inquiry" className={buttonVariants({ size: "lg" })}>
          {t("cta")}
        </a>
      </Container>
    </section>
  );
}
