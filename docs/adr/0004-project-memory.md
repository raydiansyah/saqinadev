# 0004. Project memory: governed assets, review, scoped retrieval

- Status: accepted
- Date: 2026-10-22

## Context

Memory was one flat table per project. Anything an agent or a chat wrote landed in it unreviewed, every
member (and every agent, through its creator) read all of it, nothing had a status, a version, a source
or a delete, and search was `ILIKE`. That is not safe once memory also holds what a person said in a
private chat.

## Decision

Memory is a governed knowledge asset. The architecture follows the layered ideas of TencentDB-Agent-Memory
(L0 to L3 levels, an asset registry, bindings). No code was copied from it, so no licence notice is
needed; this is not an implementation of that project and claims no compatibility with it.

1. **Registry.** `memory_assets` holds what authorization, lifecycle and retrieval need (type, owner,
   visibility, status, version, hash, full-text column). Type-specific content stays next to it
   (`memories` for chat assets). Only `chat` has a handler; `skill`, `wiki` and `code` are reserved in
   `domain/memory.ts` and are rejected as unsupported.
2. **Scope and access, before search.** `visibleWhere` (SQL) and `canRead` (object) in `memory/policy.ts`
   and `memory/scope.ts` encode the same rules. `private` is the owner only (admins and the owner's agents
   included); `project` is members and agents allowed to read memory; `restricted` and `agent` need an ACL
   grant; unreviewed assets are for the owner and admins. `organization` exists in the vocabulary and
   grants nothing yet. An agent is its own principal and never inherits its creator's private memory.
   Retrieval applies the filter inside the query and again to the rows it is about to return.
3. **Levels.** L1 facts, L2 scenario summaries (built from at least five approved facts of one kind, cited,
   deterministic, still reviewed), L3 core (pinned by a person). L0 is never copied: it is a
   `memory_sources` reference to a message or document.
4. **Review.** Chat extraction and `write_memory` create `pending_review` assets, private to the owner of
   the conversation (or the agent's creator). Approval picks the visibility. A text that disagrees with an
   approved memory of the same kind is flagged (`conflict_with_id`) and approval needs an explicit
   choice (replace or keep both); code never settles it. A rejected or deleted identity leaves a
   hash-only tombstone, so extraction and imports do not bring it back.
5. **Jobs.** Extraction and consolidation run from `memory_jobs`: idempotency key, `for update skip
   locked`, three attempts with backoff, error codes only. Started with `after()`; the maintenance cron is
   the safety net. Without a model only explicit statements ("remember that", "ingat bahwa", "decision:")
   are extracted; a model's candidates must cite messages of the window and share words with them or they
   are dropped.
6. **Retrieval.** `retrieveMemory`: scope, pinned L3, Postgres full-text (`simple` configuration, so it
   works for Indonesian and English), exact match for identifiers, rank fusion (RRF, k = 60) with
   confidence and level weights, dedupe by hash, a context budget (12 items, 8,000 characters, 1.2k per
   item, 1.5 s) and telemetry without query text. A failure returns an empty result marked `degraded`,
   never another project's data. The assistant says so instead of guessing.
7. **Bindings.** `memory_bindings` select what an agent or role starts with. Access is re-checked at
   retrieval, so a binding never overrides a revoked permission.
8. **Sources of truth.** Memory is context, not the record. Invoice and payment status come from billing,
   task status from tasks, scope from the approved scope, code from the repository at the revision being
   changed. Amounts are never taken from memory or a model.

## Phase C: document wiki (added)

- A wiki page is a *plain extraction* of one source, not generated text. A source is a project document
  (PRD, plan and custom documents; business documents never enter) or a document file of the connected
  repository. Each source has a registry row (`asset_type = wiki`, shared with the project) and
  `wiki_sources`, `wiki_chunks` (heading path, start and end line, full-text column) and `wiki_links`
  (Markdown links and `[[name]]`, resolved in both directions).
- Ingestion is incremental and idempotent: a content hash (and, for project documents, the version) says
  whether a source changed; unchanged sources are not read again, a removed source loses its page,
  passages and links. Project documents are read by an `index_wiki` job queued from the change outbox
  (cron backfills projects that have none); repository documents are read when they are imported or
  synced (`indexDocs`).
- `retrieveWiki` has the same order as memory retrieval (access in the query, full-text and exact match,
  RRF, budget, second access check, telemetry). Every passage carries its source, heading and lines and a
  `stale` flag computed from the source as it is now. No match returns no passage and the assistant is
  told to say so; `search_wiki` (MCP, permission `read_prd`) returns the same with a ready citation.
- Full-text queries match any word and rank by how many match (a question is not a conjunction); quotes
  or a minus sign switch to web-search syntax.
- Hardening after review: lines are cut at 2,000 characters and headings are parsed without regular
  expressions that can backtrack (a hostile line could otherwise stall the server for seconds), a bad
  link cannot fail an import (each repository document is read in its own savepoint), secrets are
  scrubbed from titles, summaries and passages when a page is built, a source that no longer exists is
  never returned or listed before the next job removes it, and `search_wiki` opens with the permission
  that gates it (`read_prd`).
- Limits: Markdown and plain text only (no PDF or Office extraction, and no parser dependency was added);
  no model writes or summarises pages; conflicting sources are not detected or surfaced yet; links resolve
  within what the wiki has read.

## Phase D: skill library (added)

- A skill is a `skills` row next to its registry row (`asset_type = skill`): description, use case,
  triggers, exclusions, prerequisites, ordered steps, expected outputs, validation criteria and resource
  links. Each saved version is also kept as JSON in `memory_versions`. `skill_usages` records every use
  (agent, run, version) and its outcome (success, partial, failure, with a scrubbed note); the numbers
  shown are counts of those rows, nothing is estimated.
- Visibility follows the memory rules. A new skill is private to its author. Making it available to the
  project, to chosen people or to agents is an admin decision: an admin does it directly, an author's
  request puts the skill in `pending_review` (unavailable to others) until an admin approves. A
  non-admin's edit to a shared skill sends it back to review; every version is kept. Agents only see
  approved skills that are shared with the project or granted to them, never a private one.
- Proposals: when an agent run completes (`transition`), its skills are settled with the result and an
  `extract_skill` job is queued, one per run. The job proposes a skill only for a real (not simulated)
  run with at least three recorded steps, and only when a model is configured: rules never make a skill
  up. The proposal is evaluated first (`evaluateSkill`): a single step or a secret blocks it, a score
  below 50 drops it; otherwise it is stored private and `pending_review` with its score and open issues.
  A rejected or deleted name is not proposed again (tombstone).
- Use: agents get bound skills (bindings may point at a skill) plus the best matches for the task in
  their prompt, each recorded as used by the run. MCP tools `search_skills` (`read_memory`) and
  `record_skill_outcome` (`write_memory`); their input and output are not kept in the tool audit.
- Review bypasses closed after adversarial review: a non-admin's edit, restore or visibility change of a
  skill that is not private always ends in `pending_review` (archiving first does not avoid it);
  approving or rejecting is pinned to the version the reviewer saw (a stale version is a CONFLICT) and
  the review card shows the whole skill; chosen people and agents are granted by admins only, and
  grants are cleared on approval; a proposal's text is flagged (`risky_content`) when it carries a
  link, a shell or network command, a secret-file name or override wording. An agent can only report on
  a skill it was given (a use is recorded when a run or `search_skills` offers it), once per skill,
  agent and run.
- Limits: matching is full-text on name, description, use case, triggers and step titles (triggers and
  exclusions are shown to the model, not evaluated by code); resources are links, never embedded files;
  a skill's own tally holds only reports by a person or by the agent that used it; how the runs that were offered it ended is shown separately (`settled_by = run`), because a run can end well without using the skill; `memory_bindings.task_types` has no source of task types yet, so a binding that sets it is never loaded; no automatic retirement of skills that keep failing yet (the counts are shown for a person to act on).

## Phase E: code graph (added)

- **Parser decision.** `typescript` moved from devDependencies to dependencies (already in the repo, Apache-2.0,
  passes `check:licenses`, no new package). Only its syntax parser is used (`createSourceFile`): nothing is
  type-checked or executed, and it is loaded lazily by the indexing job only. This covers TypeScript and
  JavaScript (ts, tsx, js, jsx, mjs, cjs); other languages (PHP, Python) are not read and the page says
  nothing about them. Extension path: a second parser behind `parseSource`'s `ParsedFile` shape.
- **What is kept.** Only names, places and relationships, never the code: `code_indexes` (branch, the commit it
  describes, parser and version, status, import aliases from the repository's tsconfig, registry row for
  access), `code_files` (path, content id from the host, test or not, status), `code_symbols` (functions,
  classes, methods, interfaces, types, enums, exported values, with lines and the class a method belongs to),
  `code_imports` (resolved to a file of the index) and `code_calls` (resolved to one symbol, or `name_only`).
- **Source and authorization.** Read from the project's own repository connection through its stored
  credential (`withSecret`), so a private repository is indexed only through an authorised connection and
  the token never reaches the graph or a prompt. Only GitHub can list a whole tree today; other hosts are
  reported as unsupported and nothing is half-read. Access is the memory registry's (`asset_type = code`,
  project-visible); agents need `read_repository` (new token scope and permission). Disconnecting the
  repository deletes every index.
- **Revision.** Every file of an index is read at one commit (not the moving branch). Each answer carries
  branch, commit, parser, and `stale` (the branch has a newer commit); an index is partial when the repository
  has more than 1,500 source files, and says so. Unchanged files (same content id) are not read again.
- **Jobs.** `index_code`: list the tree, mark changed files pending, read and parse 60 per run, queue the next
  run until none are left, then link imports and calls and mark the index ready. A host error marks the index
  failed and the job retries. Triggered by a manual "Read again", a change of the repository's head seen by
  `syncRepository`, and a daily sweep. It is not push-driven yet.
- **Honesty about calls.** A call is `resolved` only when the syntax and the imports (or `this`, a namespace,
  a class) point at one symbol, following re-exports a few levels; otherwise it stays `name_only` and is shown
  as "same name only". Dynamic calls, aliasing through variables and inheritance are not seen, and the
  UI and every tool answer say so.
- **Queries.** `findSymbols`, `callersOf`, `impactOf` (files that depend on a file, directly or through others,
  and the test files among them), as the MCP tools `find_symbol`, `find_callers`, `file_impact` and the
  Code tab. Agents are told to ask them before planning a change and then read the real files.
- Hardening after review: a file the database will not take (too many imports, a NUL byte, a very long
  name) or that overflows the parser fails alone (`store_error`, `parse_error`) and the files behind it are
  still read; a file is locked while it is stored so two runs cannot duplicate its rows, and runs for one
  branch take turns on an advisory lock; the continuation job is keyed by the job that asked for it, so
  a retry asks for the same one and unreadable files cannot stall the chain (they are tried again on a new
  commit); a new parser reads every file again; connecting a different repository (or host) deletes the old
  graph and starts the first read, and a disconnect during a run leaves nothing behind; the connection's
  head is kept current so `stale` is true only when the branch really moved; only the default branch is
  served unless a branch is named, and each answer names the repository; one index holds at most 300,000
  symbols and 600,000 calls (the rest is skipped and the index says partial); linking is a few bulk
  statements; the tool audit keeps no paths or names; `export * as ns` is one name, not every name; and a
  relative import cannot climb out of the repository.
- Local names: a function's parameters, local variables, nested functions and catch variables are tracked, so
  a call to a name the function binds itself is not recorded (it is not a call to the import or the
  top-level symbol of that name) and a method called on a local object gets no qualifier that could resolve
  to a class. `impactOf` says when its lists stop short (`truncated`: more than 500 files in a level, or
  dependents deeper than the five levels followed).
- Deploy size: `typescript` is 23 MB and is traced into every function that can reach the indexer. Queuing
  and running are separate modules (`code/schedule.ts`, `enqueue.ts`, `runas.ts` are light; `jobs.ts`,
  `code/indexer.ts` and `code/parse.ts` are heavy), which took the build from 44 of 112 traced routes down
  to 11 (the memory pages, which import the server actions that start a job, the cron and the assistant
  route). Moving the job runner to a route of its own would cut that further.
- Limits: `impactOf` follows five levels; no call graph across packages or into `node_modules`; path aliases only as `"@/*"` style wildcards;
  branches other than the default are indexed only when asked; the graph is a guide for finding the way,
  never proof that code is correct.

## Phase G: external integration (added)

- **Service contract.** The memory API is the set of services under `src/lib/memory/`, each starting from
  `loadProjectAccess` and the registry's rules: `createMemory` / `createMemoryTx`, `approveMemory`,
  `rejectMemory`, `updateMemory`, `archiveMemory`, `deleteMemory`, `changeVisibility`, `shareMemory`,
  `retrieveMemory`, `readAsset`, `retrieveWiki`, `retrieveSkills`, the skill lifecycle (`createSkill`,
  `updateSkill`, `approveSkill`, `setSkillVisibility`, ...), `findSymbols` / `callersOf` / `impactOf`,
  `createBinding` / `resolveLoadout`, the job queues (`enqueue*`), and `exportMemoryPackage` /
  `importMemoryPackage`. Nothing outside them touches the tables, and no endpoint exposes a query
  or an index directly.
- **External agents** use the MCP endpoint of the project with a scoped token (`read_memory`,
  `write_memory`, `read_project`, `read_prd`, `read_repository`): `search_memory`, `read_memory`,
  `write_memory` (a proposal), `search_wiki`, `search_skills`, `record_skill_outcome`, `find_symbol`,
  `find_callers`, `file_impact`. Effective access is the token's scopes, the agent's own permissions and
  the creator's role, and agents are their own principal: they never see their creator's private memory.
  There is no other external write path.
- **Export / import.** `GET /api/projects/[slug]/memory/export` (session only, never cached, rate limited,
  audited by counts) returns one JSON package (`saqina-memory`, version 1, with a checksum): the approved
  memories and skills the person can read, with their own private ones and never anyone else's; links into
  private chats are left out. Import (a server action on the Transfer tab) turns every item into a private
  candidate that waits in Review, owned by the importer. A package cannot carry visibility, owner,
  status, confidence or level; text that looks like a secret is refused, a skill is evaluated like any
  proposal, duplicates and previously rejected or deleted texts are skipped, at most 200 items per import
  and 200 candidates waiting per person. The checksum catches a truncated or edited file; it does not prove
  who made it, so nothing in a package is trusted.
- Hardening after review: the package is capped at 1 MB measured in bytes (what a server action accepts);
  an export holds at most 200 items, so a larger one is downloaded in numbered parts that each import in one
  go; the export route refuses cross-site requests; duplicates are judged only against the importer's own
  assets and approved project assets, so pending text of others cannot be probed; text is normalized
  (NFKC, invisible format characters removed) before the secret scan and storage; an import takes an
  advisory lock per person and project (no duplicates or overshoot of the waiting cap under concurrency)
  and does its lookups once per package instead of per item.
- Limits: wiki pages and the code graph are derived from their sources and are not exported; the export is
  not a backup (history, versions, usage and access lists are not in it); the format is versioned but
  there is only version 1, so a future change needs a reader for it.

## Not done

- Semantic search (phase F): no pgvector and no embedding operation in the AI gateway (only some
  providers offer embeddings, and it needs a configured model and an API cost). `EmbeddingProvider` is a slot
  and the UI says "Semantic search: off".
- Parsers for languages other than TypeScript and JavaScript.
- Client-facing memory: the client portal has no access at all.
- Organization-wide assets, and sharing with named people from the UI (the service and the access lists
  support it).

## Consequences

- Migration 0017 is additive; existing memories are backfilled as approved, project-visible L1 assets
  with a first version and a source. The previous release keeps working against the old columns.
- `memory_retrievals` (90 days) and finished `memory_jobs` (30 days) are pruned by housekeeping and listed
  in `docs/standards/compliance.md`.
- `write_memory` now creates a proposal; its result id is the asset id.
- Migrations 0020 to 0023 add the wiki tables, the skill tables, one use per skill, agent and run, and `skill_usages.settled_by`.
- Migration 0019 adds database guards: checks on type, visibility and status, foreign keys (set null) for
  `supersedes_id` and `conflict_with_id`, and a trigger that keeps a chat payload in the same project as
  its registry row. Retrieved items carry `origin` (who wrote them), because approval turns `extracted`
  into `confirmed` and would otherwise hide that an agent proposed it. Readers honour `valid_until`
  (no writer sets it yet). Agent loadouts read all bindings in one query.
- Migration 0018 adds `conversations.memory_cursor` (how far a chat was read), so the cursor outlives
  finished jobs. Tool audit rows for `search_memory`, `read_memory` and `write_memory` keep no input or
  output text. Deleting, archiving or unsharing a memory also strips its title from summaries that
  quoted it and from the feed and change outbox.
- Red lane (authorization, agent access, deletion): needs a human reviewer.
