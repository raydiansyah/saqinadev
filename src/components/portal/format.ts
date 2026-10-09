/** Date helpers for the portal. Calendar dates (YYYY-MM-DD) are formatted in UTC so they never shift a day. */

const tag = (locale: string) => (locale === "id" ? "id-ID" : "en-GB");

export function formatDay(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(
    date,
  );
}

export function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium" }).format(date);
}
