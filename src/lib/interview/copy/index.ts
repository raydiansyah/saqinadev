import type { Locale } from "@/i18n/locales";
import { en } from "./en";
import { id } from "./id";
import type { EngineCopy } from "./types";

const COPY: Record<Locale, EngineCopy> = { en, id };

export function getEngineCopy(locale: Locale): EngineCopy {
  return COPY[locale];
}

export type { EngineCopy };
export { en as defaultCopy };
