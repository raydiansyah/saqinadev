import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Tab = "overview" | "review" | "skills" | "wiki" | "code" | "transfer" | "jobs" | "bindings";

/** Sections of project memory as plain links: works without JavaScript, shows the review count. */
export async function MemoryTabs({
  slug,
  active,
  pending,
  admin,
}: {
  slug: string;
  active: Tab;
  pending: number;
  admin: boolean;
}) {
  const t = await getTranslations("memoryHub.tabs");
  const base = `/project/${slug}/memory`;
  const tabs: { key: Tab; href: string }[] = [
    { key: "overview", href: base },
    { key: "review", href: `${base}/review` },
    { key: "skills", href: `${base}/skills` },
    { key: "wiki", href: `${base}/wiki` },
    { key: "code", href: `${base}/code` },
    { key: "transfer", href: `${base}/transfer` },
    ...(admin
      ? [
          { key: "jobs" as const, href: `${base}/jobs` },
          { key: "bindings" as const, href: `${base}/bindings` },
        ]
      : []),
  ];
  return (
    <nav aria-label={t("label")} className="mb-6 overflow-x-auto">
      <ul className="inline-flex min-w-full gap-1 border-b border-border sm:min-w-0">
        {tabs.map(({ key, href }) => (
          <li key={key}>
            <Link
              href={href}
              aria-current={active === key ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap",
                active === key
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(key)}
              {key === "review" && pending > 0 ? (
                <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-xs text-primary-foreground">
                  {pending}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
