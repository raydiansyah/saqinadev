import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/locales";
import { type Copy, type EmailContent, renderEmail, siteBase } from "./layout";

/**
 * One function per message. Each renders in the recipient's language only and returns
 * subject + html + text, ready for the sender.
 */

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

/** Any stored or detected value to a supported locale. */
export const toLocale = (value: string | null | undefined): Locale =>
  value && isLocale(value) ? value : DEFAULT_LOCALE;

const build = (subject: Copy, content: EmailContent, locale: Locale): Rendered => ({
  subject: subject[locale],
  ...renderEmail(content, locale),
});

const hi = (name: string): Copy => ({ en: `Hi ${name},`, id: `Halo ${name},` });

export function verifyEmailMessage(name: string, url: string, locale: Locale): Rendered {
  return build(
    { en: "Verify your Saqina Dev email", id: "Verifikasi email Saqina Dev Anda" },
    {
      preheader: {
        en: "Confirm your email to finish creating your account.",
        id: "Konfirmasi email Anda untuk menyelesaikan pembuatan akun.",
      },
      greeting: hi(name),
      title: { en: "Confirm your email", id: "Konfirmasi email Anda" },
      body: {
        en: ["Confirm your email address to finish creating your Saqina Dev account."],
        id: ["Konfirmasi alamat email Anda untuk menyelesaikan pembuatan akun Saqina Dev."],
      },
      buttons: [{ label: { en: "Verify email", id: "Verifikasi email" }, url }],
      footnote: {
        en: "If you did not sign up, you can ignore this email.",
        id: "Jika Anda tidak mendaftar, abaikan email ini.",
      },
    },
    locale,
  );
}

export function resetEmailMessage(name: string, url: string, locale: Locale): Rendered {
  return build(
    { en: "Reset your Saqina Dev password", id: "Atur ulang kata sandi Saqina Dev Anda" },
    {
      preheader: {
        en: "Choose a new password. The link expires in one hour.",
        id: "Buat kata sandi baru. Tautan berlaku satu jam.",
      },
      greeting: hi(name),
      title: { en: "Reset your password", id: "Atur ulang kata sandi" },
      body: {
        en: ["Use the button below to choose a new password. The link expires in one hour."],
        id: ["Gunakan tombol di bawah untuk membuat kata sandi baru. Tautan berlaku satu jam."],
      },
      buttons: [{ label: { en: "Choose a new password", id: "Buat kata sandi baru" }, url }],
      footnote: {
        en: "If you did not ask for this, you can ignore this email. Your password stays the same.",
        id: "Jika Anda tidak memintanya, abaikan email ini. Kata sandi Anda tidak berubah.",
      },
    },
    locale,
  );
}

export function inviteEmailMessage(
  org: string,
  client: string,
  url: string,
  locale: Locale,
): Rendered {
  return build(
    {
      en: `${org} invited you to the project portal`,
      id: `${org} mengundang Anda ke portal project`,
    },
    {
      preheader: {
        en: `${org} invited you to follow your projects.`,
        id: `${org} mengundang Anda memantau project.`,
      },
      title: { en: "You are invited to the project portal", id: "Anda diundang ke portal project" },
      body: {
        en: [`${org} invited you to follow your projects with ${client} on Saqina Dev.`],
        id: [`${org} mengundang Anda memantau project ${client} di Saqina Dev.`],
      },
      buttons: [{ label: { en: "Open the portal", id: "Buka portal" }, url }],
      footnote: {
        en: "The link works once and expires in 7 days.",
        id: "Tautan berlaku sekali dan kedaluwarsa dalam 7 hari.",
      },
    },
    locale,
  );
}

/** Event titles. The subject reuses them, so a change here updates both. */
export const EVENT_TITLES: Record<string, Copy> = {
  "reminder.invoice_due": { en: "Invoice due soon", id: "Invoice segera jatuh tempo" },
  "reminder.invoice_overdue": { en: "Invoice overdue", id: "Invoice lewat jatuh tempo" },
  "reminder.approval_pending": { en: "Approval waiting", id: "Menunggu persetujuan" },
  "reminder.change_request_pending": {
    en: "Change request waiting",
    id: "Change request menunggu",
  },
  "reminder.maintenance_renewal": {
    en: "Maintenance ends soon",
    id: "Maintenance segera berakhir",
  },
  "approval.requested": { en: "Approval requested", id: "Permintaan persetujuan" },
  "change_request.sent": { en: "Change request to review", id: "Change request untuk ditinjau" },
  "invoice.issued": { en: "New invoice", id: "Invoice baru" },
  "message.posted": { en: "New message", id: "Pesan baru" },
  "meeting_note.shared": { en: "Meeting notes shared", id: "Catatan meeting dibagikan" },
  "meeting_note.accepted": { en: "Meeting note accepted", id: "Catatan meeting diterima" },
  "meeting_note.declined": { en: "Meeting note declined", id: "Catatan meeting ditolak" },
  "client.reminder": { en: "Reminder", id: "Pengingat" },
};
const FALLBACK_TITLE: Copy = { en: "Project update", id: "Pembaruan project" };

/** Notification mail: the event title, its details, and a link into the app in the same language. */
export function notificationEmailMessage(
  type: string,
  params: Record<string, string>,
  href: string | null,
  locale: Locale,
): Rendered {
  const title = EVENT_TITLES[type] ?? FALLBACK_TITLE;
  const base = siteBase();
  // Params are free-form values from the event (project, title, amount): shown as rows.
  const details = Object.values(params)
    .filter(Boolean)
    .map((value) => ({ label: "", value }));
  return build(
    { en: `Saqina Dev: ${title.en}`, id: `Saqina Dev: ${title.id}` },
    {
      preheader: title,
      title,
      body: {
        en: ["There is an update on your project. Open Saqina Dev to see the details."],
        id: ["Ada pembaruan pada project Anda. Buka Saqina Dev untuk melihat detailnya."],
      },
      details,
      buttons: [
        {
          label: { en: "Open Saqina Dev", id: "Buka Saqina Dev" },
          url: href ? `${base}/${locale}${href}` : base,
        },
      ],
    },
    locale,
  );
}

export function inquiryEmailMessage(name: string, slug: string | null, locale: Locale): Rendered {
  const base = siteBase();
  return build(
    { en: "New service inquiry", id: "Pertanyaan layanan baru" },
    {
      preheader: {
        en: `${name} sent a service inquiry.`,
        id: `${name} mengirim pertanyaan layanan.`,
      },
      title: { en: "New service inquiry", id: "Pertanyaan layanan baru" },
      body: {
        en: ["Someone sent an inquiry through the services page. Reply from the inbox."],
        id: ["Seseorang mengirim pertanyaan lewat halaman layanan. Balas dari inbox."],
      },
      details: [
        { label: { en: "From", id: "Dari" }, value: name },
        ...(slug ? [{ label: { en: "Service", id: "Layanan" }, value: slug }] : []),
      ],
      buttons: [
        {
          label: { en: "Open inbox", id: "Buka inbox" },
          url: `${base}/${locale}/dashboard/services/inquiries`,
        },
      ],
    },
    locale,
  );
}
