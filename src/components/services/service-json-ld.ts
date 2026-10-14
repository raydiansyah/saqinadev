import { CURRENCY_DIGITS } from "@/lib/domain/business";
import type { PublicService } from "@/lib/services/public";
import { siteConfig } from "@/lib/site";

/** Schema.org Service. `offers` only when a concrete amount is public; never for hidden prices. */
export function serviceJsonLd(
  service: PublicService,
  locale: "en" | "id",
  homeLabel: string,
  allLabel: string,
) {
  const url = `${siteConfig.url}/${locale}/services/${service.slug}`;
  const price = service.price;
  const offers =
    price && typeof price.amount === "number"
      ? {
          offers: {
            "@type": "Offer",
            url,
            priceCurrency: price.currency,
            // Stored in minor units; schema.org wants the major-unit price.
            price: price.amount / 10 ** CURRENCY_DIGITS[price.currency],
          },
        }
      : {};
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: service.title,
        description: service.metaDescription || service.shortDescription,
        url,
        inLanguage: locale,
        provider: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
        ...offers,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: homeLabel,
            item: `${siteConfig.url}/${locale}`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: allLabel,
            item: `${siteConfig.url}/${locale}/services`,
          },
          { "@type": "ListItem", position: 3, name: service.title, item: url },
        ],
      },
    ],
  };
}
