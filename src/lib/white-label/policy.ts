/**
 * The white-label rules as data, so the product shows exactly what the policy says and a test
 * can hold the two together. White label is LOCKED by default. It opens for one organization in
 * only two ways, and each leaves a written record:
 *
 *  - a paid plan whose terms include it (the record names the plan), or
 *  - a written agreement signed by both Saqina and the organization (the record names it).
 *
 * It closes again when the plan ends, the agreement ends or is breached, the grant is revoked,
 * or its end date passes. A closed white label never deletes anything: the portal simply shows
 * the default Saqina brand again.
 */

export const WHITE_LABEL_BASES = ["paid_plan", "agreement"] as const;
export type WhiteLabelBasis = (typeof WHITE_LABEL_BASES)[number];

export interface WhiteLabelGrant {
  basis: WhiteLabelBasis;
  /** The plan or agreement that opens it: a plan code, or an agreement reference number. */
  reference: string;
  grantedAt: Date;
  /** Calendar date (YYYY-MM-DD) on which it stops; null for no end date. */
  validUntil: string | null;
  revokedAt: Date | null;
}

export type LockReason = "never_granted" | "revoked" | "expired";

export type WhiteLabelState =
  | { unlocked: true; basis: WhiteLabelBasis; reference: string; validUntil: string | null }
  | { unlocked: false; reason: LockReason };

/** Whether the grant is open on `today` (YYYY-MM-DD). Pure. The end date itself is still open. */
export function evaluateGrant(grant: WhiteLabelGrant | null, today: string): WhiteLabelState {
  if (!grant) return { unlocked: false, reason: "never_granted" };
  if (grant.revokedAt) return { unlocked: false, reason: "revoked" };
  if (grant.validUntil && grant.validUntil < today) return { unlocked: false, reason: "expired" };
  return {
    unlocked: true,
    basis: grant.basis,
    reference: grant.reference,
    validUntil: grant.validUntil,
  };
}

/** What a brand may change once white label is open, and what it never touches. */
export const WHITE_LABEL_MAY = [
  "name",
  "logo",
  "accent_colour",
  "domain",
  "email_sender",
  "issuer_details",
] as const;

export const WHITE_LABEL_NEVER = [
  "sign_in_and_security",
  "privacy_and_terms_links",
  "no_impersonation",
  "ai_marker",
  "abuse_contact",
  "team_area",
] as const;
