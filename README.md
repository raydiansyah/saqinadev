# Saqina Dev

Paperwork for an agency and its clients: invoices, receipts (kwitansi), contracts both sides sign, payment
reminders, and a client portal that can carry the agency's own name. English and Indonesian. Built by Abati
Technology, live at saqina.dev.

Product requirements and status: [docs/PRD.md](docs/PRD.md). What v1 removed and why:
[ADR 0030](docs/adr/0030-v1-billing-focus.md).

## What it does

- **Invoices and payments.** Payment terms, custom invoices, `INV-YEAR-NNN` numbers issued once, payments
  recorded by hand, balances computed from stored records.
- **Receipts.** Recording a payment issues its `KWT-YEAR-NNN` receipt in the same transaction, with the amount
  in words. Voiding the payment voids the receipt.
- **Contracts.** Proposal, agreement, handover and maintenance agreement are drafted from project data,
  approved, signed by the team and the client, then issued with a reference number
  ([ADR 0006](docs/adr/0006-two-party-document-signing.md)).
- **Reminders.** Rules in days before or after a due date, once per item, to the team, the client or both,
  by in-app notice and email. A rule can also ask for WhatsApp; no provider is connected yet.
- **PDF files.** Invoices, receipts and contracts as PDF, built on request and attached to the mail that
  announces an invoice or a receipt.
- **Client portal.** Clients sign in separately and see only their own projects.
- **White label.** Locked until a plan or agreement opens it; then the agency's name, logo, accent colour,
  mail sender and issuer details replace Saqina's on the portal, mail, documents and PDF files
  ([standard](docs/standards/white-label.md), [ADR 0031](docs/adr/0031-brand-in-the-database-and-the-letterhead.md)).

## How it is built

Next.js (App Router) with PostgreSQL through Drizzle, Better Auth for sign-in, next-intl for English and
Indonesian, and `@react-pdf/renderer` for PDF files. Authorization is checked on the server for every id; a
stranger asking for another organization's record gets NOT_FOUND. Rules live in `src/lib/<area>`
(`billing`, `documents`, `reminders`, `white-label`, `pdf`, `notifications`), pages and actions in
`src/app`, tables in `src/lib/db/schema`. Outside systems (mail, WhatsApp) sit behind small interfaces so
tests use fakes.

## Prerequisites

- Node.js 24 LTS and pnpm 10
- PostgreSQL 14+, plus a second database whose name contains `_test` for tests. Use a **local**
  database in `.env.local`: `DATABASE_URL` must not point at production (Neon), because `pnpm dev`,
  `pnpm db:*` and the seed all write to it

## Local setup

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local`. Every variable is documented in [`.env.example`](.env.example); the required ones are
`DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`.

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

The seed prints a demo owner and a demo client login (local use only). `pnpm db:create-owner` makes a real
platform owner instead.

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
| `pnpm check:licenses` / `pnpm check:coverage` | Licence and coverage gates used in CI |
| `pnpm db:generate` / `db:migrate` / `db:seed` | Schema migrations and seed data (local database only) |
| `pnpm db:migrate:neon` | Apply migrations to Neon with `neonctl`; asks to confirm, `--backup` snapshots first, `--dry-run` shows the plan |
| `pnpm smoke <url>` | Post-deploy smoke test |

## Documentation

- [Product requirements (PRD)](docs/PRD.md): users, goals, requirements with status
- [Engineering standards](docs/standards/README.md): architecture, security, testing, delivery, observability, compliance, governance
- [Installation guide](docs/installation.md): local setup and deploy
- [Design and landing page](docs/design-and-landing.md): Saqina's own look
- [Runbook](docs/runbook.md): deploy, scheduled jobs, WhatsApp, white label, dropping removed tables, roll back, incidents
- [Architecture decisions](docs/adr/)
- User guides, signed-in only and written per reader: the team at `/dashboard/docs`, clients at `/portal/docs`.
  Pages are Markdown in `src/content/docs/<owner|client>/<en|id>/` and their screenshots in
  `src/content/docs/assets/<owner|client>/`
