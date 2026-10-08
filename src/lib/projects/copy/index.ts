import type { Locale } from "@/i18n/locales";
import { en } from "./en";
import { id } from "./id";
import type { GeneratorCopy } from "./types";

const COPY: Record<Locale, GeneratorCopy> = { en, id };

export const getGeneratorCopy = (locale: Locale): GeneratorCopy => COPY[locale];
export type { GeneratorCopy };
