import { Container } from "@/components/primitives/container";
import { buttonVariants } from "@/components/ui/button";
import type { SiteContent } from "@/content/site";
import { Link } from "@/i18n/navigation";

/** Closes the loop: back to the project node the story started from. */
export function FinalCta({ content }: { content: SiteContent["finalCta"] }) {
  return (
    <section aria-labelledby="final-cta-heading" className="border-t border-border py-24 sm:py-32">
      <Container className="max-w-3xl text-center">
        <div
          aria-hidden="true"
          className="mx-auto mb-10 flex w-fit items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5"
        >
          <span className="size-1.5 rounded-full bg-primary" />
          <span className="font-mono text-xs text-muted-foreground">{content.node}</span>
        </div>
        <h2
          id="final-cta-heading"
          className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl"
        >
          {content.lines.map((line, i) => (
            <span key={line} className={i === 2 ? "block text-primary" : "block"}>
              {line}
            </span>
          ))}
        </h2>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/dashboard/new" className={buttonVariants({ size: "lg" })}>
            {content.primary}
          </Link>
          <a href="#how-it-works" className={buttonVariants({ size: "lg", variant: "outline" })}>
            {content.secondary}
          </a>
        </div>
      </Container>
    </section>
  );
}
