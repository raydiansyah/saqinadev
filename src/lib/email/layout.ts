import type { Locale } from "@/i18n/locales";

/**
 * Branded transactional email shell: table layout with inline styles (the only thing mail
 * clients agree on), rendered in ONE language chosen by the recipient's locale, a graphite header carrying the saqina.dev mark, a light body for
 * readability in any client, and a plain-text twin generated from the same content.
 * Every dynamic value goes through `esc`: names and titles are user-controlled.
 */

export interface Copy {
  en: string;
  id: string;
}

export interface EmailButton {
  label: Copy | string;
  url: string;
  /** Secondary buttons are outlined, so one email can offer both language links. */
  secondary?: boolean;
}

export interface EmailContent {
  /** Preview text shown next to the subject in the inbox. */
  preheader: Copy;
  title: Copy;
  /** Short plain lines under the title, e.g. "Hi Budi,". */
  greeting?: Copy;
  body: { en: string[]; id: string[] };
  /** Label / value rows, e.g. the project name and invoice amount. */
  details?: { label: Copy | string; value: string }[];
  buttons?: EmailButton[];
  footnote?: Copy;
}

const COLORS = {
  page: "#F4F1EE",
  card: "#FFFFFF",
  border: "#E7E1DB",
  header: "#1B1815",
  text: "#1F1B18",
  muted: "#6B645E",
  brand: "#FF6A55",
  onBrand: "#2B0D08",
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);

/** Base URL of the deployed site, no trailing slash. */
export function siteBase(env: Record<string, string | undefined> = process.env): string {
  return (env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_SITE_URL ?? "https://saqina.dev").replace(
    /\/$/,
    "",
  );
}

const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : "#");
const pick = (value: Copy | string, lang: Locale) =>
  typeof value === "string" ? value : value[lang];

function paragraphs(lines: string[]) {
  return lines
    .map(
      (line) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${COLORS.text};">${esc(line)}</p>`,
    )
    .join("");
}

function contentBlock(title: string, lines: string[]) {
  return `<tr><td style="padding:22px 32px 8px;">
<p style="margin:0 0 12px;font-size:20px;line-height:1.35;font-weight:700;color:${COLORS.text};">${esc(title)}</p>
${paragraphs(lines)}
</td></tr>`;
}

const FALLBACK_LINK: Copy = {
  en: "If the button does not work, copy this link:",
  id: "Jika tombol tidak berfungsi, salin tautan ini:",
};

function button(b: EmailButton, lang: Locale) {
  const label = pick(b.label, lang);
  const style = b.secondary
    ? `background:${COLORS.card};color:${COLORS.text};border:1px solid ${COLORS.text};`
    : `background:${COLORS.brand};color:${COLORS.onBrand};border:1px solid ${COLORS.brand};`;
  return `<a href="${esc(safeUrl(b.url))}" style="display:inline-block;margin:0 8px 10px 0;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;${style}">${esc(label)}</a>`;
}

export function renderEmail(
  content: EmailContent,
  locale: Locale = "en",
  base = siteBase(),
): { html: string; text: string } {
  const lang = locale;
  const detailRows = (content.details ?? [])
    .map((d) => {
      const label = pick(d.label, lang);
      const value = `font-size:14px;font-weight:600;color:${COLORS.text};vertical-align:top;`;
      // A row without a label (free-form event details) uses the full width.
      return label
        ? `<tr><td style="padding:6px 0;font-size:13px;color:${COLORS.muted};width:38%;vertical-align:top;">${esc(label)}</td><td style="padding:6px 0;${value}">${esc(d.value)}</td></tr>`
        : `<tr><td colspan="2" style="padding:6px 0;${value}">${esc(d.value)}</td></tr>`;
    })
    .join("");
  const buttons = content.buttons ?? [];
  const links = buttons
    .map(
      (b) =>
        `<br><a href="${esc(safeUrl(b.url))}" style="color:${COLORS.muted};word-break:break-all;">${esc(b.url)}</a>`,
    )
    .join("");
  const title = content.title[lang];

  const html = `<!doctype html>
<html lang="${lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(content.preheader[lang])}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;overflow:hidden;font-family:${FONT};">
<tr><td style="background:${COLORS.header};padding:20px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:10px;vertical-align:middle;"><img src="${esc(base)}/brand/logo-mark-light.png" width="28" height="28" alt="" style="display:block;border:0;"></td>
<td style="vertical-align:middle;font-size:20px;font-weight:700;letter-spacing:-.01em;color:#F5F2EE;font-family:${FONT};">saqina<span style="color:${COLORS.brand};">dev</span></td>
</tr></table></td></tr>
<tr><td style="height:4px;background:${COLORS.brand};font-size:0;line-height:0;">&nbsp;</td></tr>
${content.greeting ? `<tr><td style="padding:24px 32px 0;"><p style="margin:0;font-size:15px;color:${COLORS.muted};">${esc(content.greeting[lang])}</p></td></tr>` : ""}
${contentBlock(title, content.body[lang])}
${detailRows ? `<tr><td style="padding:6px 32px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${COLORS.border};border-bottom:1px solid ${COLORS.border};">${detailRows}</table></td></tr>` : ""}
${buttons.length ? `<tr><td style="padding:22px 32px 6px;">${buttons.map((b) => button(b, lang)).join("")}</td></tr>` : ""}
${buttons.length ? `<tr><td style="padding:4px 32px 0;"><p style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.muted};">${esc(FALLBACK_LINK[lang])}${links}</p></td></tr>` : ""}
${content.footnote ? `<tr><td style="padding:18px 32px 0;"><p style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.muted};">${esc(content.footnote[lang])}</p></td></tr>` : ""}
<tr><td style="padding:26px 32px 28px;"><p style="margin:0;padding-top:16px;border-top:1px solid ${COLORS.border};font-size:12px;color:${COLORS.muted};">Saqina Dev &middot; <a href="${esc(base)}" style="color:${COLORS.muted};">${esc(base.replace(/^https?:\/\//, ""))}</a></p></td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [
    content.greeting?.[lang],
    title,
    ...content.body[lang],
    ...(content.details ?? []).map((d) =>
      pick(d.label, lang) ? `${pick(d.label, lang)}: ${d.value}` : d.value,
    ),
    "",
    ...buttons.map((b) => `${pick(b.label, lang)}: ${b.url}`),
    content.footnote ? `\n${content.footnote[lang]}` : undefined,
    `\nSaqina Dev - ${base}`,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  return { html, text };
}
