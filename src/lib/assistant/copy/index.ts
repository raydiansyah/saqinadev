import type { Locale } from "@/i18n/locales";
import { en } from "./en";
import { id } from "./id";
import type { AssistantCopy } from "./types";

const COPY: Record<Locale, AssistantCopy> = { en, id };

export const getAssistantCopy = (locale: Locale): AssistantCopy => COPY[locale];
export type { AssistantCopy };
