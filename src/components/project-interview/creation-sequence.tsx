import { useTranslations } from "next-intl";
import { type CSSProperties, useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const STEPS = ["understanding", "structuring", "recommending", "workspace", "ready"] as const;
const STEP_MS = 320;

/**
 * Short, deterministic transition while the workspace is created. It never runs longer than
 * the real work plus ~1.5 s, and reduced-motion users see the result directly.
 */
export function CreationSequence({ done, slug }: { done: boolean; slug: string }) {
  const t = useTranslations("project.review");
  const nextActions = useTranslations("project.nextActions");
  const [index, setIndex] = useState(0);
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, STEPS.length - 2)), STEP_MS);
    return () => clearInterval(timer);
  }, [reduced]);

  const shown = done ? STEPS.length - 1 : reduced ? 0 : index;
  const finished = done && (reduced || index >= STEPS.length - 2);

  if (finished) {
    return (
      <section
        aria-labelledby="ready-heading"
        className="panel-in rounded-lg border border-primary/40 bg-surface p-6 sm:p-8"
      >
        <h2
          id="ready-heading"
          className="text-2xl font-semibold tracking-tight"
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          {t("readyTitle")}
        </h2>
        <p className="mt-2 text-muted-foreground">{t("readyBody")}</p>
        <ul className="mt-4 space-y-1.5">
          {(["requirements", "prd", "plan", "memory", "decisions"] as const).map((key, i) => (
            <li
              key={key}
              className="reveal-item flex items-center gap-2"
              style={{ "--i": i } as CSSProperties}
            >
              <span aria-hidden="true" className="font-mono text-success">
                ✓
              </span>
              {t(`created.${key}`)}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted-foreground">
          {t("nextStep")}{" "}
          <span className="font-medium text-foreground">{nextActions("reviewPrd")}</span>
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/project/${slug}`} className={buttonVariants({ size: "lg" })}>
            {t("open")}
          </Link>
          <Link
            href={`/project/${slug}/prd`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            PRD.md
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-border bg-surface p-6"
    >
      <ol className="space-y-2">
        {STEPS.slice(0, -1).map((key, i) => (
          <li
            key={key}
            className={cn("flex items-center gap-2 transition-opacity", i > shown && "opacity-40")}
          >
            <span
              aria-hidden="true"
              className={cn("font-mono", i < shown ? "text-success" : "text-muted-foreground")}
            >
              {i < shown ? "✓" : i === shown ? "●" : "○"}
            </span>
            {t(`creating.${key}`)}
          </li>
        ))}
      </ol>
    </div>
  );
}
