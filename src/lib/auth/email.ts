import "server-only";
import { log } from "@/lib/log";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
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
    async send({ to, subject, text }) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text }),
      });
      if (!response.ok) {
        log.error("email.send_failed", { status: response.status });
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

// The auth flow does not know the visitor's language, so messages carry both.
export const authEmails = {
  verify: (name: string, url: string): Omit<EmailMessage, "to"> => ({
    subject: "Verify your Saqina Dev email / Verifikasi email Saqina Dev",
    text: [
      `Hi ${name},`,
      "Confirm your email to finish creating your Saqina Dev account:",
      url,
      "",
      "Konfirmasi email Anda untuk menyelesaikan pembuatan akun Saqina Dev:",
      url,
      "",
      "If you did not sign up, ignore this email. / Abaikan email ini jika Anda tidak mendaftar.",
    ].join("\n"),
  }),
  reset: (name: string, url: string): Omit<EmailMessage, "to"> => ({
    subject: "Reset your Saqina Dev password / Atur ulang kata sandi Saqina Dev",
    text: [
      `Hi ${name},`,
      "Use this link to choose a new password. It expires in one hour:",
      url,
      "",
      "Gunakan tautan ini untuk membuat kata sandi baru. Berlaku satu jam:",
      url,
      "",
      "If you did not ask for this, ignore this email. / Abaikan jika Anda tidak memintanya.",
    ].join("\n"),
  }),
};
