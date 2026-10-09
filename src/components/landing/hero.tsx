import type { CSSProperties } from "react";
import { Container } from "@/components/primitives/container";
import { buttonVariants } from "@/components/ui/button";
import type { SiteContent } from "@/content/site";
import { Link } from "@/i18n/navigation";
import { HeroScene } from "./hero-scene";

// Load timeline (ms): headline, lead, points, then CTAs.
const at = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export function Hero({ content }: { content: SiteContent["hero"] }) {
  return (
    <section aria-labelledby="hero-heading" className="pt-12 pb-16 sm:pt-20 sm:pb-24">
      <Container className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
        <div>
          <h1
            id="hero-heading"
            className="intro text-balance text-[2.5rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl"
            style={at(150)}
          >
            {content.title}
          </h1>
          <p className="intro mt-5 text-xl text-primary sm:text-2xl" style={at(300)}>
            {content.lead}
          </p>
          <ul className="mt-6 space-y-2">
            {content.points.map((point, i) => (
              <li
                key={point}
                className="intro flex items-start gap-3 text-muted-foreground"
                style={at(420 + i * 90)}
              >
                <span
                  aria-hidden="true"
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                />
                {point}
              </li>
            ))}
          </ul>
          <div className="intro mt-8 flex flex-col gap-3 sm:flex-row" style={at(800)}>
            <Link href="/dashboard/new" className={buttonVariants({ size: "lg" })}>
              {content.primaryCta}
            </Link>
            <a href="#how-it-works" className={buttonVariants({ size: "lg", variant: "outline" })}>
              {content.secondaryCta}
            </a>
          </div>
        </div>
        <HeroScene cards={content.cards} />
      </Container>
    </section>
  );
}
