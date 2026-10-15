import "server-only";
import type { Locale } from "@/i18n/locales";
import { resetEmailMessage, verifyEmailMessage } from "@/lib/email/templates";
import { log } from "@/lib/log";

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text twin, always present: clients that block HTML and spam filters read it. */
  text: string;
  html?: string;
}

/** Sends transactional email. The implementation is chosen from the environment. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Development: prints the message (and its links) to the server console. */
const consoleSender: EmailSender = {
  async send({ to, subject, text }) {
    console.info(`\n[email] to=${to}\n[email] subject=${subject}\n${text}\n`);
  },
};

/** Resend REST API, called with fetch so no SDK is needed. */
function resendSender(apiKey: string, from: string): EmailSender {
  return {
    async send({ to, subject, text, html }) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text, ...(html ? { html } : {}) }),
      });
      if (!response.ok) {
        // Resend explains itself ("domain is not verified", "invalid from"); keep that for the logs.
        const detail = await response.text().catch(() => "");
        log.error("email.send_failed", { status: response.status, detail: detail.slice(0, 300) });
        throw new Error("Email could not be sent");
      }
    },
  };
}

export function getEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (apiKey && from) return resendSender(apiKey, from);
  if (process.env.NODE_ENV === "production") {
    log.warn("email.console_in_production", { hint: "Set RESEND_API_KEY and EMAIL_FROM" });
  }
  return consoleSender;
}

// The language comes from the page the visitor was on (see lib/email/locale).
export const authEmails = {
  verify: (name: string, url: string, locale: Locale): Omit<EmailMessage, "to"> =>
    verifyEmailMessage(name, url, locale),
  reset: (name: string, url: string, locale: Locale): Omit<EmailMessage, "to"> =>
    resetEmailMessage(name, url, locale),
};
