/**
 * Writes every email template, in both languages, to .email-preview/*.html so the design can
 * be reviewed in a browser without sending anything:
 *   pnpm email:preview && open .email-preview/index.html
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { Locale } from "../src/i18n/locales";
import {
  inquiryEmailMessage,
  inviteEmailMessage,
  notificationEmailMessage,
  resetEmailMessage,
  verifyEmailMessage,
} from "../src/lib/email/templates";

const link = "https://saqina.dev/api/auth/verify-email?token=preview-token";

const render = (locale: Locale) => ({
  verify: verifyEmailMessage("Budi Santoso", link, locale),
  reset: resetEmailMessage("Budi Santoso", link, locale),
  invite: inviteEmailMessage(
    "Saqina Dev",
    "PT Maju Jaya",
    `https://saqina.dev/${locale}/invite/preview`,
    locale,
  ),
  invoice: notificationEmailMessage(
    "invoice.issued",
    { number: "INV-2026-007", project: "Restaurant POS", amount: "Rp2.500.000" },
    "/portal/restaurant-pos/billing",
    locale,
  ),
  approval: notificationEmailMessage(
    "approval.requested",
    { title: "Homepage design", project: "Company website" },
    "/portal/company-website/approvals",
    locale,
  ),
  inquiry: inquiryEmailMessage("Dewi Lestari", "ai-daily-assistant", locale),
});

const samples = Object.fromEntries(
  (["en", "id"] as const).flatMap((locale) =>
    Object.entries(render(locale)).map(([name, m]) => [`${name}-${locale}`, m] as const),
  ),
);

mkdirSync(".email-preview", { recursive: true });
for (const [name, m] of Object.entries(samples))
  writeFileSync(`.email-preview/${name}.html`, m.html);
writeFileSync(
  ".email-preview/index.html",
  `<!doctype html><meta charset="utf-8"><title>Email previews</title><body style="font-family:sans-serif;padding:24px">${Object.entries(
    samples,
  )
    .map(
      ([name, m]) =>
        `<h3>${name}: ${m.subject}</h3><iframe src="${name}.html" style="width:640px;height:760px;border:1px solid #ccc"></iframe>`,
    )
    .join("")}</body>`,
);
console.log(`Wrote ${Object.keys(samples).length} previews to .email-preview/`);
