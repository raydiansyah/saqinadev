import type { Locale } from "@/i18n/locales";
import { en } from "./en";
import { id } from "./id";
import type { LegalDocId, LegalDocument } from "./types";

const LEGAL: Record<Locale, Record<LegalDocId, LegalDocument>> = { en, id };

export function getLegalDocument(locale: Locale, doc: LegalDocId): LegalDocument {
  return LEGAL[locale][doc];
}

export type { LegalDocId, LegalDocument };
