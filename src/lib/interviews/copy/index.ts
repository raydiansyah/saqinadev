import type { Locale } from "@/i18n/locales";
import { en } from "./en";
import { id } from "./id";
import type { ProjectCopy } from "./types";

const COPY: Record<Locale, ProjectCopy> = { en, id };

export const getProjectCopy = (locale: Locale): ProjectCopy => COPY[locale];
export type { ProjectCopy };
