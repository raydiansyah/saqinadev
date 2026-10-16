# 0003. Project brain: change outbox, memory journal, PRD check, document map

- Status: accepted
- Date: 2026-10-16

## Context

Everything that reads a project (the assistant, agents, MCP clients, the context package) used to
rebuild its picture by scanning documents and tables, and memory only held what a person typed. Each
repository also organises its documentation differently.

## Decision

One write path feeds every reader, with no scanning:

1. `recordActivity` writes a row to `project_changes` (the outbox) in the same transaction as any
   change that moves `projects.contextRevision`. Nothing is missed, nothing is half-recorded.
2. `processProjectChanges` consumes the pending rows (after the response through `after()`, with the
   maintenance cron as safety net; `for update skip locked` so two runs never take the same rows):
   - **Memory journal**: decisions, PRD/plan revisions, stack changes and repository connections become
     one concise memory each, keyed (`memories.dedupe_key`) so the fact is updated in place. A memory a
     person edited (`human_edited_at`) is never overwritten; unchanged text writes nothing.
   - **PRD check**: `prd_findings` open and close by fingerprint as the PRD and the project drift apart
     and converge. Fixing the PRD always goes through a proposal (`APPEND_PRD`), never an automatic edit.
3. `doc_index` records what each repository document is for (name, folder, content or a model's hint),
   with a hash, so a sync only processes changed paths. Files under a memory folder become memories.
4. `getProjectBrain(access, { sinceRevision })` is the single reader (cached per revision), used by the
   context package (`BRAIN.md`), the assistant and the MCP tools `get_changes`, `read_doc_map`,
   `list_prd_findings` and `write_memory`.

Agents and MCP clients may append memory (`write_memory`, behind the `write_memory` token scope and the
agent's own permission): append-only, de-duplicated, audited as a tool execution.

## Consequences

- A reader that knows its last revision asks for the delta, not the project.
- Memory contains facts, not a log; the activity feed remains the log.
- Migrations 0013 to 0016 are additive (expand step); the previous release keeps working against them.
- The outbox grows with every change: rows are processed, not deleted. Add retention (see
  `src/lib/housekeeping/retention.ts`) once volume is known.
- Red lane: the MCP tool surface and token scopes.
