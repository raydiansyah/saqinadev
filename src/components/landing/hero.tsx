import type { CSSProperties } from "react";
import { Container } from "@/components/primitives/container";
import { buttonVariants } from "@/components/ui/button";
import type { SiteContent } from "@/content/site";
import { Link } from "@/i18n/navigation";
import { HeroPaths } from "./hero-paths";

// Load timeline (ms): headline, then each half of the promise, then the paths, then CTAs.
const at = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

interface HeroProps {
  content: SiteContent["hero"];
  paths: SiteContent["heroPaths"];
}

export function Hero({ content, paths }: HeroProps) {
  return (
    <section aria-labelledby="hero-heading" className="pt-14 pb-20 sm:pt-24 sm:pb-28">
      <Container className="grid items-center gap-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <h1
            id="hero-heading"
            className="intro text-balance text-[2.75rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl xl:text-7xl"
            style={at(150)}
          >
            {content.title}
          </h1>
          <p className="mt-6 text-2xl leading-snug sm:text-3xl">
            <span className="intro block" style={at(300)}>
              {content.lead[0]}
            </span>
            <span className="intro block text-primary" style={at(420)}>
              {content.lead[1]}
            </span>
          </p>
          <p
            className="intro mt-6 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
            style={at(550)}
          >
            {content.body}
          </p>
          <div className="intro mt-9 flex flex-col gap-3 sm:flex-row" style={at(850)}>
            <Link href="/dashboard/new" className={buttonVariants({ size: "lg" })}>
              {content.primaryCta}
            </Link>
            <a href="#how-it-works" className={buttonVariants({ size: "lg", variant: "outline" })}>
              {content.secondaryCta}
            </a>
          </div>
        </div>
        <HeroPaths content={paths} />
      </Container>
    </section>
  );
}
