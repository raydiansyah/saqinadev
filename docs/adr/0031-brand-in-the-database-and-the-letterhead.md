# 31. Brand settings live in one row, the logo in the database, and the agency leads the letterhead

Status: accepted (2026-11-12). Risk lane: Red (identity, client-facing documents, email sender).

## Context

White label was a lock with no settings ([white label standard](../standards/white-label.md), W5 planned).
Building the settings raised four questions: where the logo lives, what a branded document looks like,
how mail to a client is branded, and what stops a brand from impersonating the platform or making the
portal unreadable. The standard also said both that every document keeps the Saqina letterhead and that
the agency is the issuer on invoices, which cannot both hold.

## Decision

- One row per organization, `org_brand`: brand name, legal name, tax number, address, accent colour, logo,
  email sender name and reply-to. It is read only while the white-label grant is open
  (`loadBrand`); closing it hides the row and brings the Saqina look back without deleting anything.
- The logo is a PNG or JPEG of at most 200 KB, 32 to 1600 px, stored on the row. The type is read from the
  bytes; SVG is refused because it can carry script. Keeping it on the row removes a file store, deletes
  it with the organization, and makes it part of the existing database backup. It is served by an
  authenticated route to the organization's people and its clients only, and not at all while closed.
- With white label open, the agency leads the letterhead of invoices, receipts and contracts (logo, brand
  or legal name, tax number, address) and the legal name is the issuer. A small "powered by Saqina Dev"
  line stays on every branded document, and the portal footer keeps the privacy and terms links. This
  replaces the sentence "every document carries the Saqina letterhead".
- The accent must stand out from the dark portal (3:1) and have a text colour that reads on it (4.5:1);
  otherwise it is refused. A brand name that contains "saqina" is refused unless the organization's own
  name does.
- Mail to a client carries the brand name and accent and is sent with the brand as the display name from
  the platform's verified address, with the agency's reply-to. The logo is not placed in mail: it is not a
  public file.
- The brand reaches a portal user only when all their client accounts belong to one organization.

## Consequences

- A custom domain, a brand logo in mail and an abuse contact are not part of this change (PRD W8, W9).
- The logo ships inside every backup of the row and is read through the application, not a CDN. At 200 KB
  per organization that is acceptable; a larger limit needs a file store.
- PDF files fetch the logo from the row directly.
