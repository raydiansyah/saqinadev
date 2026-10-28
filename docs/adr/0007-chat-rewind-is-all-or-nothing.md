# 7. Chat rewind is all or nothing

Status: accepted (2026-10-26). Risk lane: Red (it changes project data, including documents shown to clients).

## Context

People want to go back to an earlier message in the assistant chat and have the project look the way
it did then, not only the conversation. The assistant changes real records while it answers: tasks,
requirements, the PRD, but also invoices, payment schedules, client reminders, agent runs and
handoffs. Some of those can be put back exactly; others have already reached a person or another
system.

## Decision

- **A ledger, written with the change.** The executor records, in the same transaction as each
  change, what is needed to reverse it (`conversation_changes`): the before and after of a task or
  requirement, or the document versions on either side of an edit. A change that cannot be put back
  is recorded as `irreversible`.
- **Rewind to a message** hides every later message (`messages.rewound_at`, never deleted), cancels
  proposals from those messages that are still waiting, and reverses the ledger newest first,
  through the same services as any other edit, so the activity feed and versions stay honest.
- **All or nothing.** If any later change is irreversible, or a record was edited after the assistant
  changed it, the whole rewind is refused with the list of blockers and nothing is touched. The check
  is the real reversal run in a transaction that is rolled back (the preview uses the same path), so
  the preview cannot disagree with the result.
- **Reversible:** creating or updating a task or requirement, appending to the PRD, rewriting a
  document (the old text returns as a new version). **Irreversible:** deleting a task, memory,
  decisions, payment schedules, invoices, scope items, change requests, generated documents, client
  reminders, handoffs, tool runs and agent assignments.
- **Fork is the alternative** for a blocked rewind. A fork copies the thread only and never touches
  the project.

## Consequences

- A rewind after an invoice or a client reminder is not possible, by design: nothing is silently
  half-undone. The dialog says which change stops it and offers a fork.
- A rewind that restores a document can re-trigger document sync, which is the intended outcome.
- Ledger rows and hidden messages stay for the audit trail; memory candidates already extracted from
  a hidden message stay in review and a person decides about them.
- Adding an action type means deciding, in `assistant/actions/undo.ts`, whether it is reversible.
