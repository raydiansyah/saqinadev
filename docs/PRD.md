# Saqina Dev: product requirements

Status of this page: rewritten 2026-11-12 for v1, which narrows the product to invoices, receipts,
contract signing, payment reminders and white label ([ADR 0027](adr/0027-v1-billing-focus.md)). It is
the PRD that [`CLAUDE.md`](../CLAUDE.md) tells every tool to check before a feature is built or changed.
Change the product and this page in the same pull request.

Each requirement carries a status: **Built** (in the product and tested), **Partial** (some of it works;
the gap is named), **Planned** (agreed, not built).

## 1. Problem

An agency or studio that sells project work to clients sends invoices from a spreadsheet, confirms
payments in chat, keeps agreements in email and chases late payers by hand. A client cannot see what is
owed, what was paid, or what was signed without asking. Receipts are written on request, and nobody
remembers whether the agreement in the thread is the version both sides agreed to.

## 2. Product

A workspace for the paperwork between an agency and its clients. Each client project holds its
invoices, the receipts for the payments received, the contracts both sides sign, and the reminders that
chase what is unpaid or unsigned. The client follows all of it in a portal that can carry the agency's own
name. Built by Abati Technology, live at saqina.dev, in English and Indonesian.

Saqina does not write code, host projects or run AI assistants. Those parts were removed in v1 (section 9).

## 3. Users

| User | Needs |
|---|---|
| Owner or admin (agency lead) | Issue invoices and receipts, send contracts for signature, see what is overdue, set the brand |
| Editor | Draft and edit documents and meeting notes |
| Viewer | Read a project |
| Client (portal user) | Read and download invoices and receipts, sign agreements, see what is due; never see internal data |
| Platform owner (Saqina staff) | Open and close white label for an organization |

Roles are `owner`, `admin`, `editor`, `viewer` per project. Portal users are a separate kind and are never
project members.

## 4. Goals and non-goals

Goals:

1. Every amount a client owes or has paid comes from stored invoices and payments, never from a typed total.
2. A payment produces a numbered receipt in the same step, so the two cannot disagree.
3. A contract is issued only after both sides signed the same text.
4. A late payment or a missing signature is chased without anyone remembering to do it.
5. The client sees the agency's brand, not Saqina's, once white label is open.
6. Every change to money or agreements leaves an audit trail.

Non-goals for v1: accounting beyond invoices, payments and receipts; payment gateways (payments are
recorded by hand); e-signature with a legal certificate authority; a custom domain for the portal; code
generation, AI assistants and agents; project planning (requirements, tasks, PRD); a WhatsApp provider
(the channel exists, see R6).

## 5. Requirements

### 5.1 Projects and clients

| # | Requirement | Status |
|---|---|---|
| P1 | A project is a plain container: name, optional description, optional client. Created from a form, no interview | Built |
| P2 | Clients with contact details, an optional phone number and portal invitations; an invitation works once, for the invited email, and can be revoked or expire | Built |
| P3 | Archive, restore and delete a project (delete needs the typed name) | Built |
| P4 | Project and client belong to an organization; people of another organization get NOT_FOUND | Built |

### 5.2 Invoices and payments

| # | Requirement | Status |
|---|---|---|
| I1 | Payment terms (percent or fixed, with due dates) per project; an invoice drafted from a term takes its amount from the schedule | Built |
| I2 | Custom invoices with free lines; a draft is internal until issued | Built |
| I3 | Issuing assigns `INV-YEAR-NNN` per organization and year, atomically, once; a number is never reused | Built |
| I4 | Payments are recorded by a person; overpaying is refused; a mistaken payment is voided with a reason and stays visible | Built |
| I5 | Totals, balance and status (issued, sent, partially paid, paid, overdue, cancelled) are computed from invoices and payments | Built |
| I6 | The currency of a project locks once an invoice exists | Built |
| I7 | Invoice as a PDF file (team and client), also attached to the mail that announces it, with the issuer's legal name, tax number and address | Built |

### 5.3 Receipts (kwitansi)

| # | Requirement | Status |
|---|---|---|
| K1 | Recording a payment issues its receipt in the same transaction, numbered `KWT-YEAR-NNN` per organization and year; one receipt per payment | Built |
| K2 | The receipt copies amount, date, method and reference from the payment, writes the amount in words (Indonesian or English), and names client, invoice and issuer | Built |
| K3 | Voiding a payment voids its receipt; the number stays used. A payment recorded before v1 gets its receipt on request | Built |
| K4 | The client is notified and reads the receipt on the portal; a voided receipt is hidden from the client | Built |
| K5 | Receipt as a printable page and as a PDF file attached to the notification mail | Built |

### 5.4 Contracts and signing

| # | Requirement | Status |
|---|---|---|
| D1 | Proposal, agreement, handover and maintenance agreement drafted from project data (client, payment terms, maintenance plan); scope and milestones are written into the draft by hand | Built |
| D2 | Drafts are edited and approved before signing; editing or regenerating clears signatures | Built |
| D3 | Signed by the team and by the client; each signature binds to one version by SHA-256; only then is the document issued with a reference (`PRP`, `AGR`, `HND`, `MNT` plus year and sequence) and locked ([ADR 0006](adr/0006-two-party-document-signing.md)) | Built |
| D4 | The client signs only what the team approved and shared; asking for changes sends the document back and removes signatures | Built |
| D5 | Contract as a PDF file with the signatures and their dates | Built |
| D6 | Free-form Markdown documents, versioned, with the same share and approval flow | Built |
| D7 | Meeting notes: written by the team or the client, shared on request, reviewed by the team | Built |
| D8 | Maintenance plans with cycle, fee, response time, scope and exclusions; renewal reminders; warranty end date | Built |

### 5.5 Reminders

| # | Requirement | Status |
|---|---|---|
| R1 | Rules per organization in days before or after an anchor date: invoice due, invoice overdue, agreement waiting for the client's signature, maintenance renewal | Built |
| R2 | A daily job sends the latest reached rule once per item; re-running sends nothing new | Built |
| R3 | Audience per rule: the team, the client or both; clients only receive them while the portal is open for the project | Built |
| R4 | Channels: in-app and email, with the invoice or receipt PDF attached to the mail that announces it | Built |
| R5 | The team can run the job for its own organization and send a manual reminder for an open invoice or an unsigned agreement (a button on each), once per day | Built |
| R6 | WhatsApp: a rule can also send its client reminder to the client's phone number. The channel is an interface with a console sender; no provider is connected, so in production the delivery is recorded as skipped | Partial: provider open |

### 5.6 Client portal

| # | Requirement | Status |
|---|---|---|
| C1 | Clients sign in separately from the team and see only the projects shared with them | Built |
| C2 | The client reads invoices, payments, receipts, shared documents, maintenance and meeting notes, and signs agreements | Built |
| C3 | "Needs your attention" lists agreements waiting for the client's signature and overdue invoices | Built |
| C4 | A stranger asking for another project's data gets NOT_FOUND, never "forbidden" | Built |
| C5 | A client guide in the portal, signed-in only | Built |

### 5.7 White label

| # | Requirement | Status |
|---|---|---|
| W1 | Locked by default; it opens only with a paid plan that includes it or a written agreement, recorded with a reference | Built |
| W2 | Only the platform owner grants or revokes; every change is an audit event; one open grant per organization | Built |
| W3 | It locks again on revoke or the day after the end date; nothing is deleted | Built |
| W4 | Brand settings behind that gate: brand name, logo (PNG or JPEG, up to 200 KB), accent colour with contrast checks, email sender name and reply-to, legal name, tax number and address | Built |
| W5 | The brand shows on the portal (name, logo, accent), on mail to the client, on invoice, receipt and contract letterheads and PDF files. The legal name, tax number and address print as the issuer | Built |
| W6 | A document keeps a small "powered by Saqina" line; the portal footer keeps the privacy and terms links; the brand name cannot imitate the platform | Built |
| W7 | The team area is never branded | Built |
| W8 | A custom domain for the portal | Planned (outside v1) |
| W9 | An abuse and security contact visible in the branded portal | Planned |

### 5.8 Platform and operations

| # | Requirement | Status |
|---|---|---|
| O1 | English and Indonesian for every screen, error and email | Built |
| O2 | Signed-in user guides, split into owner and client | Built (screenshots to be refreshed) |
| O3 | Every failure shows a reference code (`REQ-XXXX`) that is also in the log | Built |
| O4 | Audit log for sensitive changes; no secrets or personal data in logs | Built |
| O5 | Health endpoint, two cron jobs (reminders, housekeeping), post-deploy smoke test | Built |
| O6 | End-to-end journey test at 320, 768 and 1280 px | Planned |
| O7 | Account export and deletion | Built |

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | Authorization on the server for every id; input validated with zod; user text never rendered as HTML; a logo is accepted only as a PNG or JPEG read from its bytes ([security](standards/security.md)) |
| Privacy | Retention follows [compliance](standards/compliance.md); a client's phone number is used only for reminders the team switched on |
| Accessibility | WCAG 2.1 AA, keyboard and screen-reader usable, 44 px touch targets |
| Responsive | No horizontal scroll at 320, 768, 1280 px |
| States | Loading, empty and error state for every async screen, in both languages |
| Performance | No query inside a loop; new queries are indexed; PDF files are built on request, with a rate limit ([performance](standards/performance.md)) |
| Delivery | `pnpm lint`, `typecheck`, `test`, `build` pass before merge; migrations are expand-only ([delivery](standards/delivery.md)) |

## 7. Success measures

- A client can find what is owed, what was paid and what is waiting for a signature without asking the team.
- Every payment has exactly one receipt; every issued document has two signatures and a reference.
- No cross-project or cross-client data in any response (covered by the security tests).
- A reminder is sent once per item and rule, however often the job runs.
- Each failure a user reports can be found in the log by its reference code.

## 8. Open questions

- Which plans include white label, and at what price.
- Which WhatsApp provider to connect (Meta's Cloud API needs approved message templates and a verified business number; a local gateway is quicker but unofficial).
- Whether clients pay inside the portal or only see invoices (today: they see and track).
- Whether to back-fill receipts for payments recorded before v1 in one step, instead of on request.

## 9. Removed in v1

The AI assistant, project brain and memory, MCP server, the Studio, agents and executions, local CLI
providers, imports from GitHub, the requirements, PRD, plan and task tools, the interview, the services
catalogue and the UI theme catalogue. Client requests, messages, approvals and change requests were also
removed; meetings and maintenance plans stay. The code is gone from the main branch and stays in git history. Migration `0045` drops their tables; their data is not kept ([ADR 0027](adr/0027-v1-billing-focus.md)).

## 10. Where this is built

Standards: [docs/standards](standards/README.md). Decisions: [docs/adr](adr/). Operations:
[runbook](runbook.md). Guides for people: `src/content/docs/`. Code map: `src/lib/<area>` holds the rules
(`billing`, `documents`, `reminders`, `white-label`, `pdf`, `notifications`), `src/app` the pages and
actions, `src/lib/db/schema` the tables.
