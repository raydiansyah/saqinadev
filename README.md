# Saqina Dev

One workspace for client projects: scope, agreements, invoices, payments, development and
maintenance, with an AI assistant that answers from the whole project record and a portal where the
client follows progress. Live at [saqina.dev](https://saqina.dev). Built by Abati Technology.

## How it uses Claude

- **Assistant and intent detection**: read-only answers and intent detection run on Claude through the
  Anthropic adapter (`src/lib/ai/adapters/anthropic.ts`). Actions that change data stay
  rule-validated; a model never writes, merges or deploys on its own.
- **Project brain**: every change is written to an outbox and distilled into memory and PRD findings,
  so Claude reads a project delta instead of rescanning it ([ADR 0003](docs/adr/0003-project-brain.md)).
- **MCP tools and agents**: Claude clients can read a project and append memory inside the permission
  they were granted; every call is audited.
- **Safe by default**: without `ANTHROPIC_API_KEY` Saqina answers from deterministic rules and no data
  leaves the server. Customer documents go to a model only with recorded consent.
- **Built with Claude Code**: AI-written code is attributed per pull request and Red-lane paths get a
  human and an adversarial review ([governance](docs/standards/governance.md)).

## Stack

Next.js 16 (App Router), React 19, TypeScript, PostgreSQL with Drizzle ORM, Better Auth, next-intl
(English and Indonesian), Tailwind CSS 4, Vitest, Biome. Deployed on Vercel with Neon.

## Prerequisites

- Node.js 24 LTS and pnpm 10
- PostgreSQL 14+, plus a second database whose name contains `_test` for tests. Use a **local**
  database in `.env.local`: `DATABASE_URL` must not point at production (Neon), because `pnpm dev`,
  `pnpm db:*` and the seed all write to it

## Local setup

Full walkthrough, including the agent Studio and deployment: [docs/installation.md](docs/installation.md).

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local`. Every variable is documented in [`.env.example`](.env.example); the required
ones are `DATABASE_URL`, `BETTER_AUTH_SECRET` and `SAQINA_ENCRYPTION_KEY`. `ANTHROPIC_API_KEY` is
optional.

```bash
pnpm db:migrate
```

```bash
pnpm db:create-owner
```

```bash
pnpm dev
```

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Run, build, serve |
| `pnpm lint` | Biome check |
| `pnpm typecheck` | Next typegen and `tsc --noEmit` |
| `pnpm test` / `pnpm test:coverage` | Vitest (integration tests need `DATABASE_URL_TEST`) |
| `pnpm e2e` | Playwright end-to-end test of the Studio (needs `DATABASE_URL_E2E`; not in CI yet) |
| `pnpm check:licenses` / `pnpm check:coverage` | Licence and coverage gates used in CI |
| `pnpm db:generate` / `db:migrate` / `db:seed` | Schema migrations and seed data (local database only) |
| `pnpm db:migrate:neon` | Apply migrations to Neon with `neonctl`; asks to confirm, `--backup` snapshots first, `--dry-run` shows the plan |
| `pnpm smoke <url>` | Post-deploy smoke test |

## Documentation

- [Product requirements (PRD)](docs/PRD.md): users, goals, requirements with status
- [Engineering standards](docs/standards/README.md): architecture, security, testing, delivery,
  observability, compliance, governance
- [Installation guide](docs/installation.md): local setup, agents, deploy
- [Runbook](docs/runbook.md): deploy, migrate, roll back, incidents
- [Architecture decisions](docs/adr/), including [imported projects follow GitHub](docs/adr/0005-imported-projects-follow-github.md) and
  [two-party document signing](docs/adr/0006-two-party-document-signing.md)
- User guides, signed-in only and written per reader: the team at `/dashboard/docs`, clients at `/portal/docs`.
  Pages are Markdown in `src/content/docs/<owner|client>/<en|id>/` and their screenshots in
  `src/content/docs/assets/<owner|client>/`, served only to people allowed to read that guide
- White label ([standard](docs/standards/white-label.md)): what a client portal may brand and what it never hides
- Proposals, agreements, handovers and maintenance agreements are drafted from project data, edited,
  approved, signed by the team and the client, and only then issued with a reference number
- Importing from GitHub: documents are read from the repository (one way, the most recent edit wins),
  everything in the docs folder is shown to the client, and the PRD is found by name or asked for
- Project memory ([ADR 0004](docs/adr/0004-project-memory.md)): chat and agent suggestions wait for review, access is
  checked before search, retrieval is full-text and exact match (semantic search is off, and the UI says so)
