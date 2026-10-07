import { Container } from "@/components/primitives/container";
import { InfraMap } from "@/components/story/stage/infra-map";
import { StatusTerminal } from "@/components/story/stage/status-terminal";
import type { SiteContent } from "@/content/site";

export function Infrastructure({
  content,
  planned,
}: {
  content: SiteContent["infra"];
  planned: string;
}) {
  return (
    <section aria-labelledby="infra-heading" className="border-t border-border py-20 sm:py-28">
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div>
          <h2
            id="infra-heading"
            className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            {content.title}
          </h2>
          <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">{content.body}</p>
          <div data-reveal className="mt-8">
            <StatusTerminal content={content} />
          </div>
        </div>
        <div data-reveal>
          <InfraMap content={content} planned={planned} />
        </div>
      </Container>
    </section>
  );
}
