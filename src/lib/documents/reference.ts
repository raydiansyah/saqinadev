/**
 * The documents two parties sign: a proposal, an agreement, a handover and a maintenance
 * agreement. Pure, so the numbering is tested without a database.
 */
export const SIGNABLE_KINDS = [
  "proposal",
  "agreement",
  "handover",
  "maintenance_agreement",
] as const;
export type SignableKind = (typeof SIGNABLE_KINDS)[number];

export const isSignable = (type: string): type is SignableKind =>
  (SIGNABLE_KINDS as readonly string[]).includes(type);

const PREFIX: Record<SignableKind, string> = {
  proposal: "PRP",
  agreement: "AGR",
  handover: "HND",
  maintenance_agreement: "MNT",
};

/** "AGR-2026-007": the kind, the year it was issued, and the number within that year. */
export const documentReference = (kind: SignableKind, year: number, n: number) =>
  `${PREFIX[kind]}-${year}-${String(n).padStart(3, "0")}`;

/** The counter a kind draws its numbers from (one row per organization, kind and year). */
export const referenceCounter = (kind: SignableKind) => `document:${kind}`;
