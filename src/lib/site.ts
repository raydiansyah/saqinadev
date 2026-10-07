/** Language-neutral site facts. Localised titles and descriptions live in `content/site`. */
export const siteConfig = {
  name: "Saqina Dev",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://saqina.dev",
} as const;
