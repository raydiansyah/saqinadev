# Architecture and code design

## Layers (Separation of Concerns): enforced by review, structure by convention

```
page / route handler / server action   thin: parse input, call one service, shape the result
        │   (src/app/**, wrapped in runAction from src/lib/actions.ts)
        ▼
service                                 business rules, authorization, transactions, audit
        │   (src/lib/<domain>/service.ts, one folder per domain)
        ▼
repository / query                      drizzle queries only, no rules
            (src/lib/<domain>/repository.ts or queries.ts, schema in src/lib/db/schema)
```

- UI components (`src/components/**`) hold presentation and local state only. They never import
  `server-only` modules or the database, and they never decide who may do what.
- A service takes an `Actor` (or `ProjectAccess`) and checks permission itself. A button being hidden
  is never the check.
- An external system (AI provider, Git host, email, MCP) is reached through an adapter behind an
  interface (`src/lib/ai/adapters`, `src/lib/git`), never from a component or an action directly.

## SOLID, applied here

| Principle | What it means in this codebase |
|---|---|
| Single responsibility | One reason to change per module. A service function does one use case; pure helpers (`verify.ts`, `check.ts`, `map-docs.ts`) hold logic that needs no database. |
| Open/closed | New behaviour is a new entry in a registry (`ADAPTERS`, `GIT_ADAPTERS`, `TOOLS`, `ACTION_POLICY`), not an `if` in existing code. |
| Liskov | Anything implementing `AiProvider`, `GitAdapter` or `SyncAdapter` honours the whole contract, including error codes; tests use fakes of the same interface. |
| Interface segregation | Small interfaces per need; a caller that only reads does not receive write methods. |
| Dependency inversion | High-level code depends on the interface and receives the implementation (options such as `{ adapter, provider }`), which is also how tests inject fakes. |

## Size and shape

- **One file under 400 lines** for new and changed files. Split by responsibility, not by line count.
  Existing exceptions (data-heavy copy files, `ai/control-plane.ts`, `docsync/engine.ts`,
  `assistant/planner.ts`, `agents/orchestrator.ts`) may not grow; split them when you next change them.
- No duplicated logic: a second copy is the signal to extract. Prefer the existing helper
  (`parse` in `src/lib/validation.ts`, `allow` in `src/lib/rate-limit.ts`, `recordAudit`,
  `recordActivity`, `withSecret`, the `Party` pattern in `src/lib/engagement/shared.ts`).
- KISS: the simplest design that meets the requirement and its failure paths. No speculative options.

## Naming and layout

- Domain folders are lower-case nouns (`requirements`, `docsync`). Files: `service.ts`, `schema.ts`
  (zod), `queries.ts`, `<topic>.ts`. Components: kebab-case files, PascalCase exports.
- Vocabularies are `as const` tuples in `src/lib/domain/*` with a derived type; no database enums.
- User-facing text lives in `messages/*.json` (English and Indonesian, same keys; a test checks it).
- Errors are `AppError` with a code and optional `fields`; actions return `ActionResult`.

## Dependencies

- Add a dependency only when the platform and the existing libraries cannot do it in a few lines.
  See [delivery.md](delivery.md) for the allowlist, version locking and licence check.
- Next.js here has breaking changes from older versions: read `node_modules/next/dist/docs/` before
  using an API (see `AGENTS.md`).
