# 25. Environment variables of the app are a list the team manages, values write-only

Status: accepted (2026-11-06). Risk lane: Red (secrets, a new credential kind, a migration, values leave Saqina for Vercel and a developer's machine). Superseded by [ADR 0027](0027-v1-billing-focus.md): the feature was removed in v1.

## Context

Only a "service" (Neon, Supabase, Clerk, a custom one of at most 12 variables) could hold an
environment variable, and a custom service had to be a database or sign-in. A variable such as
`GEOCODER_API_KEY` or `NEXT_PUBLIC_MAP_STYLE` had no place, so an app built by agents could not be given
what it needs, and a preview failed on a name nobody could set.

## Decision

- **A list of variables, like a hosting dashboard.** Table `project_env_vars` (migration 0040): name,
  secret or public, a note, where it came from (manual, import, repository), and which of Production,
  Preview and Development are filled. Unique per project and name.
- **Values are write-only.** One credential of the new kind `env` per variable holds the three values,
  encrypted. The row never holds a value. Saving with an empty field keeps what is stored; a field is
  cleared explicitly. A changed value revokes the old credential.
- **Names are for the team, values for the deployment.** Any member sees names and what is filled. Only
  project admins (`project:update`) add, change, import or remove, rate limited and audited with names only.
- **Rules.** Names are upper snake case; the ones the platform sets (`NODE_ENV`, `VERCEL*`, `PORT`, `CI`,
  `NEXT_RUNTIME`) are refused; a name a service owns is refused (it is changed on the service, where the
  "preview is not production" rule lives); a name starting `NEXT_PUBLIC_` is never secret because it
  reaches the browser.
- **Same three environments as services.** Development falls back to Preview and never to Production.
  `deployVars` (pure) builds one Vercel entry per name and environment: secrets as `sensitive`, except
  Development, which Vercel stores `encrypted`.
- **Vercel stays in step, both ways.** Saving, importing and publishing send the variables (they are sent
  even while a service is not ready); removing a variable removes it from the Vercel project too
  (`removeEnv`). A failed send shows on the variable and is retried on the next save or publish.
- **One list of names everywhere.** `.env.example`, `.env.local` (Development or Preview values, never
  Production), the comparison with the repository's `.env.example`, `AGENTS.md` and the MCP setup include
  the variables. An "Add these names" button adds the names the repository lists, with no value.
- **Agents see names, never values.** A writing task is told which names exist and to add a new name to
  `.env.example` and handle its absence.

## Consequences

- A person with admin rights can type a secret into Saqina, which then holds it. The audit log records
  who and when, with names only; rotating means saving a new value.
- Pasted `.env` text is parsed on the server (quotes, `export`, trailing comments). It is kept in the
  page only until it is submitted.
- Not done: finding variables the code reads (`process.env.X`) by scanning the work branch. The
  repository's `.env.example`, which agents are told to keep, is the source for now.
