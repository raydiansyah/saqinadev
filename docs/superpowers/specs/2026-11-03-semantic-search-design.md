# Semantic search for memory and wiki (phase F)

Status: built; updated 2026-11-05 to match the code. Design approved 2026-11-03. Risk lane: Red (migration, provider credentials, access to project data).
Source plan: the Saqina Memory plan, phase F. PRD items: A8, A19. Related: [ADR 0004](../../adr/0004-project-memory.md), [ADR 0024](../../adr/0024-semantic-search.md).

## Goal

Retrieval finds the right memory and wiki text when the words differ from the query ("who pays for
hosting" finds "the client covers the Vercel bill"). Today it is full-text plus exact match, and the
UI says `semantic: off`. After this phase it says `on` for a project that opted in, and stays honest
(`off`, `degraded`; `indexing` on the Memory overview) in every other state.

## Decisions (made with the owner)

| Question | Decision |
|---|---|
| What gets vectors | Approved, unexpired memory assets and the chunks of wiki sources that are ready, when the asset's visibility is `project`. Text is cut at 6000 characters. Not the code index. |
| Where vectors live | A separate table, `memory_embeddings`, exact search per project. No external vector database. |
| Provider path | OpenAI-compatible endpoints and Gemini, through the AI gateway. Anthropic has no embedding API. |
| Consent | Opt-in per project by a person who can `members:manage`, recorded in the audit log with the consent version. Off by default. Only assets with visibility `project` are embedded; `private`, `restricted` and `agent` assets never are. |

## Why a separate table with exact search

- Switching or turning off a model means emptying one table, not rewriting columns of hot tables.
- Every search is limited to one project and to what the reader may see. An HNSW index loses recall
  under a filter that strict, and one project holds hundreds to a few thousand rows, so an exact scan
  ordered by cosine distance is fast and correct. Add HNSW only when a single project passes tens of
  thousands of rows.
- A hosted vector database would be a second source of truth with its own copy of the access rules.

## Components

### 1. Data (migration 0039, expand-only)

- `CREATE EXTENSION IF NOT EXISTS vector` (Neon provides it).
- `memory_embeddings`: `id`, `project_id`, `asset_id` and `chunk_id` (foreign keys that cascade on
  delete; a check requires exactly one), `model_id` (references `ai_models`), `content_hash`,
  `embedding vector(1536)`, `created_at`. Unique on (`asset_id`, `model_id`) and on (`chunk_id`,
  `model_id`); index on (`project_id`, `model_id`). Deleting a source deletes its vectors.
- Dimensions are fixed at 1536. The gateway asks the provider for that size (`dimensions` for OpenAI,
  `outputDimensionality` for Gemini), so a model with another native size still fits.
- The project opt-in is one column on `project_settings`: `semantic_search_enabled boolean not null
  default false`. Turning it on needs `members:manage` and the current consent version, and writes the
  audit event `memory.semantic_enabled` with the actor and that version; turning it off writes
  `memory.semantic_disabled` and deletes that project's vectors in the same transaction.
- The platform's embedding model is one row in `platform_ai_settings`: `embedding_model_id`.

### 2. AI gateway

- `AI_OPERATIONS` gains `embedding`; `MODEL_CAPABILITIES` gains `embeddings`.
- `AiProvider` gains `embed(texts, { dimensions })`. The OpenAI adapter (which also serves compatible
  endpoints such as Ollama) and the Gemini adapter implement it. The others throw the existing
  `unsupported` error, so the contract and the error codes stay the same for every provider.
- Each call writes an `ai_usage_records` row with operation `embedding`, the token count and the
  duration. Never the text.
- The Owner picks the embedding model in AI & Models. Only models with the `embeddings` capability
  are offered. The page states that embedding sends project text to that provider.
- One rule, `embedderAllowed`, decides whether a model may embed project text, at the time it is chosen
  and again on every call: it is not a person's own gateway, its provider is usable, and the Owner's
  provider policy (`allowExternalProviders` and the allow-lists) permits it. There is no fallback to
  another model, because vectors of two models cannot be compared.

### 3. Write path

- One job per project, `embed_project` in `memory_jobs`, keeps the vectors right. It lists what may be
  embedded now, deletes vectors of another model or of a source that is no longer eligible, embeds
  what is missing or whose text hash changed, and upserts. Nothing changed means no provider call. At
  most one waiting job exists per project.
- Triggers: the outbox consumer (`processProjectChanges`), the end of the `index_wiki` job, turning
  the switch on, changing the embedding model (queues every opted-in project), and the maintenance
  cron as a safety net (it also deletes the vectors of projects that are not opted in). A late
  reconcile only delays recall; it never widens access, because retrieval re-checks visibility on
  every query.
- Eligible: project opted in, asset `approved`, visibility `project`, not expired, wiki source
  `ready`, and a model configured. With no model configured ("None") a reconcile deletes the
  project's vectors.
- Each trigger schedules a run right after the response; a follow-up job, or the embed job queued at
  the end of `index_wiki`, is taken by the same run (at most 3 rounds). The cron stays the safety net.
- The runner sends up to 64 texts per provider call and embeds at most 256 texts per run; a project
  with more is finished by a follow-up job. A failure counts as an attempt like the other memory jobs.
- Re-check before sending and before writing: immediately before each provider call the job reads the
  project switch and the eligibility of the batch again (`sendable()`). If consent is off it stops
  sending and queues no follow-up job; items no longer eligible are dropped from the batch. The write
  transaction checks once more, with share locks. A window remains: an item can change between the
  check and the moment the request leaves the server, and text already sent cannot be recalled if
  consent is withdrawn while a request is in flight. In both cases nothing is stored. A vector can
  also exist briefly for an asset made private right after a write, until the next reconcile;
  retrieval re-checks visibility on every query, so it is never returned to a reader who may not see it.

### 4. Read path

- The engine embeds the query (one call, started together with the text lists, limited to 900 ms or
  60% of the retrieval budget, whichever is less) and takes the 30 nearest vectors by cosine
  distance, keeping only those below `MAX_COSINE_DISTANCE` (0.6), so an unrelated question adds
  nothing. The SQL joins the same `visibleWhere`, status and expiry predicate and the project id that
  the lexical list uses, so access is checked before ranking. The retrieval budget as a whole stays
  1500 ms.
- The three lists (full text, exact identifiers, vectors) go to the existing `rrf()` and then to the
  existing quality weights and budget.
- `semantic` in a retrieval result is one of: `on`; `off` (not opted in or no model); `degraded` (the
  provider failed or timed out, the answer is lexical only). It never falls back to another project's
  data. `indexing` (vectors cover part of the eligible items) is shown only on the Memory overview.

### 5. UI

- The Memory overview shows "Semantic search: on", "off", or "indexing X of Y", and holds the switch
  for project admins, with the consent dialog (what is sent, to which provider, that private items
  are excluded, that it can be turned off and the vectors are then deleted). The wiki page shows a
  hint. `degraded` appears only in a retrieval result (the `semantic` field of the memory search
  tool), not on the overview.
- Every string exists in English and Indonesian, with loading, empty and error states.

## Security and privacy

- Access is checked before search; a vector row never widens who can read an asset.
- Only `project` visibility is embedded. The next reconcile embeds an asset that becomes visible to
  the project and deletes the vector of one that stops being so.
- Vectors are never returned to browsers, agents or MCP clients, and never logged. Logs carry counts
  and ids only.
- The provider key stays in the encrypted credential store. Embedding calls are rate limited per
  project (120 a minute, shared by questions and background runs; a run makes at most 4) and counted
  in usage.
- Turning the feature off, deleting a project and deleting an asset each delete the vectors.

## Tests

- Policy matrix: assets that are not `project` visibility are never embedded; a reader without access gets no vector hit;
  project A never sees project B in a vector search.
- Fusion: `rrf` with a real vector list orders as expected and a missing list changes nothing.
- Jobs: a second reconcile with nothing changed calls no provider; a changed hash replaces the vector;
  consent withdrawn or an asset made private during a run gets no vector; a failed provider retries and
  ends in `failed_retryable` then `failed_permanent` without text in `error_code`.
- Degraded path: provider timeout returns lexical results with `semantic: degraded`.
- Gateway: adapters map dimensions and errors; unsupported adapters fail with the same code.
- Migration applies on an existing database and rolls back by redeploy (expand-only).
- A fake embedding provider (deterministic vectors) is used everywhere; no test calls a real API.

## Not in this phase

HNSW index, vectors for the code index, a reranker, several embedding models at once, and any
client-facing use of memory.

## Risks

- Cost and latency of the embedding call on every query. Mitigated by the 900 ms limit and the
  degraded path, which returns lexical results when the call is slow or fails.
- Provider outage during backfill. The queue retries and the overview shows `indexing`.
- Consent is the legal basis for sending text to a provider: the consent text needs the owner's
  wording review before release.

## Acceptance

A project that opts in finds a memory by meaning on the default model; the same query on a project that
did not opt in still answers lexically with `semantic: off`; turning it off removes every vector of
that project; no test uses the network; `pnpm lint`, `typecheck`, `test` and `build` pass.
