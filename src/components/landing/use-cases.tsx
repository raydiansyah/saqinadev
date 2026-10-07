import { Section } from "@/components/primitives/section";
import type { SiteContent } from "@/content/site";
import { Link } from "@/i18n/navigation";

export function UseCases({ content }: { content: SiteContent["useCases"] }) {
  return (
    <Section id="use-cases" file={content.file} title={content.title} intro={content.intro}>
      <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
        {content.items.map((uc) => (
          <li key={uc.type} className="bg-background">
            <Link
              href={{ pathname: "/start", query: { type: uc.type } }}
              className="group flex h-full min-h-36 flex-col justify-between gap-6 p-5 transition-colors hover:bg-surface focus-visible:bg-surface"
            >
              <span>
                <span className="block font-medium">{uc.label}</span>
                <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                  “{uc.brief}”
                </span>
              </span>
              <span className="text-sm text-primary group-hover:underline">
                {content.start}
                <span className="sr-only">: {uc.label}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
