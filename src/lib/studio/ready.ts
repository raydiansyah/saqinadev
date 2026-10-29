import { isSignable } from "@/lib/documents/reference";

/**
 * When a document's page offers "Start building": the PRD or plan once approved, or a signable
 * document (proposal, agreement, ...) once both parties signed and it was issued.
 */
export function canStartBuilding(doc: {
  slug: string;
  type: string;
  status: string;
  reference: string | null;
}): boolean {
  if (doc.slug === "prd" || doc.slug === "plan")
    return doc.status === "approved" || doc.status === "signed";
  return isSignable(doc.type) && doc.status === "signed" && Boolean(doc.reference);
}
