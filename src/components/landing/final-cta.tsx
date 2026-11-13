import { Container } from "@/components/primitives/container";
import { buttonVariants } from "@/components/ui/button";
import type { SiteContent } from "@/content/site";
import { Link } from "@/i18n/navigation";

export function FinalCta({ content }: { content: SiteContent["finalCta"] }) {
  return (
    <section aria-labelledby="cta-heading" className="border-t border-border py-20 sm:py-28">
      <Container className="max-w-3xl text-center">
        <h2 id="cta-heading" className="text-3xl font-semibold tracking-tight text-balance">
          {content.title}
        </h2>
        <p className="mt-4 text-muted-foreground">{content.body}</p>
        <Link href="/dashboard/new" className={buttonVariants({ size: "lg", className: "mt-8" })}>
          {content.primary}
        </Link>
      </Container>
    </section>
  );
}
