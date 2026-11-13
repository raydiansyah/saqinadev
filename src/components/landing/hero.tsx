import { Container } from "@/components/primitives/container";
import { buttonVariants } from "@/components/ui/button";
import type { SiteContent } from "@/content/site";
import { Link } from "@/i18n/navigation";

export function Hero({ content }: { content: SiteContent["hero"] }) {
  return (
    <section aria-labelledby="hero-heading" className="py-20 sm:py-28">
      <Container className="max-w-4xl">
        <h1
          id="hero-heading"
          className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl"
        >
          {content.title}
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">{content.lead}</p>
        <ul className="mt-8 space-y-2">
          {content.points.map((point) => (
            <li key={point} className="flex gap-3">
              <span aria-hidden="true" className="font-mono text-primary">
                +
              </span>
              {point}
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard/new" className={buttonVariants({ size: "lg" })}>
            {content.primaryCta}
          </Link>
          <a href="#features" className={buttonVariants({ size: "lg", variant: "outline" })}>
            {content.secondaryCta}
          </a>
        </div>
      </Container>
    </section>
  );
}
