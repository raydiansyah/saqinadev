import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatServicePrice } from "@/lib/services/format";
import type { PublicService } from "@/lib/services/public";
import { cn } from "@/lib/utils";
import { ServiceIcon } from "./service-icon";

interface ServiceCardProps {
  service: PublicService;
  locale: "en" | "id";
  className?: string;
}

/**
 * One card, one link: the title link stretches over the whole card (after pseudo-element),
 * so keyboard and screen reader users meet a single focus target per service.
 */
export async function ServiceCard({ service, locale, className }: ServiceCardProps) {
  const t = await getTranslations({ locale, namespace: "services" });
  return (
    <article
      className={cn(
        "group relative flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-raised has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-primary",
        className,
      )}
    >
      {service.imageUrl ? (
        // biome-ignore lint/performance/noImgElement: owner-supplied remote URL, not optimised by next/image
        <img
          src={service.imageUrl}
          alt=""
          width={640}
          height={360}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="aspect-video w-full rounded-md border border-border object-cover"
        />
      ) : (
        <span className="grid size-11 place-items-center rounded-md border border-border-strong bg-background text-primary">
          <ServiceIcon name={service.icon} className="size-5" />
        </span>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-subtle-foreground">
        <span>{t(`categories.${service.category}`)}</span>
        {service.isComingSoon ? (
          <span className="rounded-sm border border-primary/40 px-1.5 py-0.5 text-primary">
            {t("card.comingSoon")}
          </span>
        ) : null}
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-balance">
        <Link
          href={`/services/${service.slug}`}
          className="outline-none after:absolute after:inset-0 after:content-['']"
        >
          {service.title}
        </Link>
      </h3>
      {service.shortDescription ? (
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          {service.shortDescription}
        </p>
      ) : null}
      {service.price ? (
        <p className="mt-auto pt-1 text-sm font-medium text-foreground">
          {formatServicePrice(service.price, locale)}
        </p>
      ) : null}
    </article>
  );
}
