import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Container } from "./container";

interface SectionProps {
  id: string;
  /** File-style label, e.g. "docs/memory.md". Part of the visual identity. */
  file: string;
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Heading layout: stacked (default) or side-by-side with the intro on large screens. */
  layout?: "stacked" | "split";
}

export function Section({
  id,
  file,
  title,
  intro,
  children,
  className,
  layout = "stacked",
}: SectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("border-t border-border py-20 sm:py-28", className)}
    >
      <Container>
        <div
          data-reveal
          className={cn(
            "mb-12 sm:mb-16",
            layout === "split"
              ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end"
              : "max-w-3xl",
          )}
        >
          <div>
            <p className="mb-4 font-mono text-[0.8125rem] text-primary">{file}</p>
            <h2
              id={headingId}
              className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              {title}
            </h2>
          </div>
          {intro ? (
            <p
              className={cn(
                "text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg",
                layout === "stacked" && "mt-5",
              )}
            >
              {intro}
            </p>
          ) : null}
        </div>
        {children}
      </Container>
    </section>
  );
}
