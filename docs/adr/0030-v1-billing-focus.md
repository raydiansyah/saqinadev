# 30. v1 covers invoices, receipts, contract signing, reminders and white label only

Status: accepted (2026-11-12). Risk lane: Red (removes data-bearing features, changes numbering and client access).

## Context

Saqina grew into a workspace for building client software with AI: an interview, a project brain,
memory, an assistant, a Studio, agents and executions, local CLI providers, an MCP server and a services
catalogue. The part people paid for was smaller: invoices, payments, agreements both sides sign, reminders
for what is unpaid, and a portal that carries the agency's name. The AI and build parts were most of the
code, most of the tests and most of the operating cost, and none of them is needed to bill a client.

## Decision

- v1 keeps invoices, payments, receipts (kwitansi), two-party contract signing, payment and signature
  reminders, the client portal, meetings, maintenance plans and white label. Everything else is removed
  from the main branch: the assistant, brain, memory, MCP, Studio, agents, executions, CLI providers,
  imports, requirements, PRD, plan, tasks, interview, services catalogue and theme catalogue. Client
  requests, messages, approvals and change requests go too.
- A project becomes a plain container (name, description, optional client). The interview that named and
  classified a project is replaced by a form.
- Recording a payment issues its receipt in the same transaction. The receipt number comes from the
  organization's `receipt` counter (`KWT-YEAR-NNN`). A voided payment voids its receipt.
- Reminders gain one kind, `document_signature_pending`, and lose the approval and change request kinds.
  Missing default rules are added to existing organizations the next time rules are read.
- Notification delivery becomes a set of channels. Email gains PDF attachments for invoices and receipts.
  WhatsApp is a channel behind an interface with a console sender only ([PRD](../PRD.md) R6).
- PDF files are built on request with `@react-pdf/renderer`, from the stored records, and never stored.
- The tables of the removed features are dropped by migration `0045`, with their schema files. The owner decided that their data is not kept or migrated, so no export or special backup step is required beyond the normal pre-migration snapshot ([runbook](../runbook.md)).

## Consequences

- The ADRs 0003 to 0005, 0007 to 0026 (except 0006) describe removed features. They stay as history and
  are marked superseded.
- Production data of the removed features is deleted when `0045` is applied. Account export no longer includes it.
- Documents drafted before this change may carry sections that came from requirements or scope; new drafts
  leave those sections as marked placeholders to fill by hand.
- `projects.status` keeps its old values; new projects start as `planning`. Narrowing the value set needs
  a data migration and is not done.
- Users of the removed features (agents, Studio, chat) lose them. The owner accepted this on 2026-11-12.
