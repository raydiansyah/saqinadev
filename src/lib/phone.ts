/**
 * Phone numbers as WhatsApp wants them: E.164, "+" and digits only. People type them as they
 * write them ("0812-0000-0000", "+62 812 0000 0000", "62812..."), so this reads the common forms
 * and returns null for anything it cannot place with confidence. Indonesia is the default country.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountry = "62",
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  let e164: string;
  if (trimmed.startsWith("+")) e164 = `+${digits}`;
  else if (digits.startsWith("00")) e164 = `+${digits.slice(2)}`;
  else if (digits.startsWith("0")) e164 = `+${defaultCountry}${digits.slice(1)}`;
  else if (digits.startsWith(defaultCountry)) e164 = `+${digits}`;
  // A local mobile number written without its leading zero: 812 0000 0000.
  else if (defaultCountry === "62" && digits.startsWith("8")) e164 = `+62${digits}`;
  else return null;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/** "+62 *** 0000": enough to recognise, not enough to call. For logs. */
export const maskPhone = (e164: string) => `${e164.slice(0, 3)}***${e164.slice(-4)}`;
