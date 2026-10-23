/** Calendar dates are stored as "YYYY-MM-DD"; format them in UTC so the day never shifts. */
export function formatDay(iso: string | null, locale: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}
