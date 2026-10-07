export type LegalBlock = { p: string } | { list: string[] };

export interface LegalSection {
  id: string;
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  description: string;
  /** ISO date of the last substantive change. */
  updated: string;
  intro: string;
  sections: LegalSection[];
}

export type LegalDocId = "privacy" | "terms";
