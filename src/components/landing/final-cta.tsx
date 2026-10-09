import { Container } from "@/components/primitives/container";
import { buttonVariants } from "@/components/ui/button";
import type { SiteContent } from "@/content/site";
import { LANDING_ASSETS } from "@/content/site/assets";
import { Link } from "@/i18n/navigation";

export function FinalCta({ content }: { content: SiteContent["finalCta"] }) {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="relative overflow-hidden border-t border-border py-20 sm:py-28"
    >
      {LANDING_ASSETS.ctaLoop ? (
        <>
          <video
            aria-hidden="true"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={LANDING_ASSETS.ctaLoop.poster}
            className="absolute inset-0 h-full w-full object-cover opacity-70 motion-reduce:hidden"
          >
            <source src={LANDING_ASSETS.ctaLoop.webm} type="video/webm" />
            <source src={LANDING_ASSETS.ctaLoop.mp4} type="video/mp4" />
          </video>
          {/* Fades the loop into the page and keeps the text readable. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,var(--background)_92%)]"
          />
        </>
      ) : null}
      <Container className="relative max-w-2xl text-center">
        <h2
          id="final-cta-heading"
          data-reveal
          className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl"
        >
          {content.title}
        </h2>
        <p data-reveal className="mt-4 text-lg text-muted-foreground">
          {content.body}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/dashboard/new" className={buttonVariants({ size: "lg" })}>
            {content.primary}
          </Link>
          <a href="#try" className={buttonVariants({ size: "lg", variant: "outline" })}>
            {content.secondary}
          </a>
        </div>
      </Container>
    </section>
  );
}
