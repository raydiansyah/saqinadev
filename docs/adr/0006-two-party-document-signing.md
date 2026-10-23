# 6. Business documents are signed by both parties before they are issued

Status: accepted (2026-10-23). Risk lane: Red (agreements, client access, numbering).

## Context

Proposals, agreements, handovers and maintenance agreements were drafted from project data, but one
click by the team marked them "signed". The client never signed, no reference number existed, and a
signed document could not be told apart from one the client had not seen.

## Decision

- A proposal, agreement, handover or maintenance agreement is **issued only when the team and the
  client have both signed the same version**. Until then it is a draft that can be edited.
- Order: edit, the team approves the text, the team shares it with the client, each party signs
  (any order). The client may instead ask for changes with a note.
- A signature belongs to one version (`document_signatures`: version, party, signer name, SHA-256 of the
  text). Changing the text, regenerating the draft, taking the approval back, or a client change request
  **removes the signatures**: nobody signs words they did not see.
- On the second signature, in the same transaction, the document becomes `signed`, stays shared, gets
  `reference` and `issued_at`, and is locked (the existing read-only rule for signed documents).
- Reference: `PRP|AGR|HND|MNT-<year>-<n>`, from the existing per-organization counter (`org_counters`), a
  separate sequence per kind and year; unique per project.
- The plain status change refuses `signed` for these four documents. Other documents keep their ordinary
  statuses.
- Only people who can change the project sign for the team; only portal users of the project's client sign
  for the client, and only on what they can read.

## Consequences

- Documents signed before this change keep status `signed` with no reference and no signature rows.
- A signature records who signed and what text, not a legal e-signature: whether it binds in a given
  jurisdiction is for the company's lawyer ([compliance](../standards/compliance.md)).
- Notifications go to the other party when one signs, to both when the document is issued, and to the team
  when the client asks for changes.
