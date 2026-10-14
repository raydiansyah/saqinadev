import { getTranslations } from "next-intl/server";
import { Container } from "@/components/primitives/container";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatServicePrice } from "@/lib/services/format";
import type { PublicService } from "@/lib/services/public";
import { BulletList, DetailBlock } from "./detail-parts";
import { InquirySection } from "./inquiry-section";
import { ServiceCard } from "./service-card";
import { ctaHref, ctaLabelOverride, effectiveCtaType } from "./service-cta";
import { ServiceIcon } from "./service-icon";

interface ServiceDetailProps {
  service: PublicService;
  related: PublicService[];
  locale: "en" | "id";
  /** Owner preview of a draft: shows a notice and switches the inquiry form off. */
  preview?: boolean;
}

/** Body of a service page (breadcrumb to inquiry form). The page adds navbar, footer and JSON-LD. */
export async function ServiceDetail({ service, related, locale, preview }: ServiceDetailProps) {
  const t = await getTranslations({ locale, namespace: "services" });
  const ctaType = effectiveCtaType(service);
  const ctaText = ctaLabelOverride(service) || t(`cta.${ctaType}`);
  const href = ctaHref(ctaType);
  const paragraphs = service.description.split(/\n{2,}/).filter((p) => p.trim());

  return (
    <>
      {preview ? (
        <div
          role="status"
          className="border-b border-warning/50 bg-surface py-3 text-sm text-warning"
        >
          <Container>{t("detail.previewNotice")}</Container>
        </div>
      ) : null}
      <article>
        <header className="pt-8 pb-12 sm:pt-12">
          <Container>
            <nav aria-label={t("detail.breadcrumbLabel")} className="mb-8 text-sm">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                <li>
                  <Link href="/" className="inline-flex min-h-8 items-center hover:text-foreground">
                    {t("detail.home")}
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li>
                  <Link
                    href="/services"
                    className="inline-flex min-h-8 items-center hover:text-foreground"
                  >
                    {t("detail.all")}
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="min-w-0 text-foreground">
                  {service.title}
                </li>
              </ol>
            </nav>
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-14">
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-subtle-foreground">
                  <span>{t(`categories.${service.category}`)}</span>
                  {service.isComingSoon ? (
                    <span className="rounded-sm border border-primary/40 px-1.5 py-0.5 text-primary">
                      {t("card.comingSoon")}
                    </span>
                  ) : null}
                </div>
                <h1 className="intro text-balance text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
                  {service.title}
                </h1>
                {service.shortDescription ? (
                  <p className="mt-5 text-pretty text-lg text-muted-foreground">
                    {service.shortDescription}
                  </p>
                ) : null}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  {href.startsWith("#") ? (
                    <a href={href} className={buttonVariants({ size: "lg" })}>
                      {ctaText}
                    </a>
                  ) : (
                    <Link href={href} className={buttonVariants({ size: "lg" })}>
                      {ctaText}
                    </Link>
                  )}
                  <Link
                    href="/services"
                    className={buttonVariants({ size: "lg", variant: "outline" })}
                  >
                    {t("detail.back")}
                  </Link>
                </div>
              </div>
              <div>
                {service.imageUrl ? (
                  // biome-ignore lint/performance/noImgElement: owner-supplied remote URL, not optimised by next/image
                  <img
                    src={service.imageUrl}
                    alt={service.title}
                    width={960}
                    height={540}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="aspect-video w-full rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="grid aspect-video w-full place-items-center rounded-lg border border-border bg-surface text-primary"
                  >
                    <ServiceIcon name={service.icon} className="size-16" />
                  </div>
                )}
              </div>
            </div>
          </Container>
        </header>

        <Container className="max-w-3xl pb-16">
          {paragraphs.length > 0 ? (
            <div className="space-y-4 pb-10 text-pretty text-lg leading-relaxed text-muted-foreground">
              {paragraphs.map((p) => (
                <p key={p} className="whitespace-pre-line">
                  {p}
                </p>
              ))}
            </div>
          ) : null}
          {service.problems.length > 0 ? (
            <DetailBlock id="problems" title={t("detail.problems")}>
              <BulletList items={service.problems} />
            </DetailBlock>
          ) : null}
          {service.capabilities.length > 0 ? (
            <DetailBlock id="capabilities" title={t("detail.capabilities")}>
              <BulletList items={service.capabilities} />
            </DetailBlock>
          ) : null}
          {service.useCases.length > 0 ? (
            <DetailBlock id="use-cases" title={t("detail.useCases")}>
              <BulletList items={service.useCases} />
            </DetailBlock>
          ) : null}
          {service.included.length > 0 ? (
            <DetailBlock id="included" title={t("detail.included")}>
              <BulletList items={service.included} />
            </DetailBlock>
          ) : null}
          {service.excluded.length > 0 ? (
            <DetailBlock id="excluded" title={t("detail.excluded")}>
              <BulletList items={service.excluded} tone="muted" />
            </DetailBlock>
          ) : null}
          {service.requirements.length > 0 ? (
            <DetailBlock id="requirements" title={t("detail.requirements")}>
              <BulletList items={service.requirements} />
            </DetailBlock>
          ) : null}
          {service.steps.length > 0 ? (
            <DetailBlock id="steps" title={t("detail.steps")}>
              <ol className="space-y-5">
                {service.steps.map((step, i) => (
                  <li key={step.title} className="flex gap-4">
                    <span aria-hidden="true" className="mt-0.5 font-mono text-sm text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-medium">
                        <span className="sr-only">{t("detail.stepNumber", { n: i + 1 })}: </span>
                        {step.title}
                      </h3>
                      {step.body ? (
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {step.body}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </DetailBlock>
          ) : null}
          {service.timeline ? (
            <DetailBlock id="timeline" title={t("detail.timeline")}>
              <p className="text-muted-foreground">{service.timeline}</p>
            </DetailBlock>
          ) : null}
          {service.price ? (
            <DetailBlock id="price" title={t("detail.price")}>
              <p className="text-lg font-medium">{formatServicePrice(service.price, locale)}</p>
            </DetailBlock>
          ) : null}
          {service.isComingSoon ? (
            <DetailBlock id="availability" title={t("detail.availability")}>
              <p className="text-muted-foreground">{t("detail.comingSoon")}</p>
            </DetailBlock>
          ) : null}
          {service.faqs.length > 0 ? (
            <DetailBlock id="faq" title={t("detail.faq")}>
              <div className="divide-y divide-border rounded-lg border border-border">
                {service.faqs.map((f) => (
                  <details key={f.q} className="group px-4 py-1">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-2 font-medium [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 text-pretty">{f.q}</span>
                      <span
                        aria-hidden="true"
                        className="font-mono text-primary transition-transform group-open:rotate-45 motion-reduce:transition-none"
                      >
                        +
                      </span>
                    </summary>
                    <p className="pb-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                  </details>
                ))}
              </div>
            </DetailBlock>
          ) : null}
        </Container>

        {related.length > 0 ? (
          <section aria-labelledby="related-heading" className="border-t border-border py-16">
            <Container>
              <h2 id="related-heading" className="text-xl font-semibold tracking-tight">
                {t("detail.related")}
              </h2>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((r) => (
                  <li key={r.slug} className="flex">
                    <ServiceCard service={r} locale={locale} className="w-full" />
                  </li>
                ))}
              </ul>
            </Container>
          </section>
        ) : null}
      </article>
      <InquirySection
        locale={locale}
        serviceSlug={preview ? undefined : service.slug}
        serviceName={service.title}
        preview={preview}
      />
    </>
  );
}
