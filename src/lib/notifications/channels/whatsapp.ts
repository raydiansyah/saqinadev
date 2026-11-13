import "server-only";
import type { Locale } from "@/i18n/locales";
import { siteBase } from "@/lib/email/layout";
import { EVENT_TITLES } from "@/lib/email/templates";
import { log } from "@/lib/log";
import { maskPhone } from "@/lib/phone";

/**
 * WhatsApp as a notification channel. The channel is a small interface so a provider (Meta's
 * Cloud API, a local gateway) can be added without touching reminders: write one more sender and
 * pick it with WHATSAPP_PROVIDER. Today only the console sender exists; in production it sends
 * nothing and reports "skipped", so no reminder is ever silently dropped or faked.
 */
export interface WhatsappMessage {
  /** E.164, validated by the caller. */
  to: string;
  text: string;
}

export interface WhatsappSender {
  readonly name: string;
  /** "sent" when the provider took the message; "skipped" when there is no provider to send with. */
  send(message: WhatsappMessage): Promise<"sent" | "skipped">;
}

/** Development: prints the message. The number is masked: logs hold no personal data. */
const consoleSender: WhatsappSender = {
  name: "console",
  async send({ to, text }) {
    if (process.env.NODE_ENV === "production") return "skipped";
    console.info(`\n[whatsapp] to=${maskPhone(to)}\n${text}\n`);
    log.info("whatsapp.console", { to: maskPhone(to) });
    return "sent";
  },
};

export function getWhatsappSender(
  env: Record<string, string | undefined> = process.env,
): WhatsappSender {
  // Providers register here by name. An unknown name falls back to the console sender rather
  // than failing a reminder run.
  switch (env.WHATSAPP_PROVIDER) {
    default:
      return consoleSender;
  }
}

const FALLBACK: { en: string; id: string } = { en: "Project update", id: "Pembaruan project" };

/** One short message: who it is from, what happened, the details, and a link. */
export function whatsappText(
  type: string,
  params: Record<string, string>,
  href: string | null,
  locale: Locale,
  senderName: string,
): string {
  const title =
    EVENT_TITLES[type] ?? EVENT_TITLES[type.split(".").slice(0, 2).join(".")] ?? FALLBACK;
  const details = Object.values(params).filter(Boolean).join(" · ");
  const link = href ? `${siteBase()}/${locale}${href}` : siteBase();
  return [`${senderName}`, title[locale], details, link].filter(Boolean).join("\n");
}
