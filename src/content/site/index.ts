import type { Locale } from "@/i18n/locales";
import { en } from "./en";
import { id } from "./id";
import type { SiteContent } from "./types";

const CONTENT: Record<Locale, SiteContent> = { en, id };

export function getSiteContent(locale: Locale): SiteContent {
  return CONTENT[locale];
}

export type { SiteContent };
