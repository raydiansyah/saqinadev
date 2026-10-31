# 23. A CLI logged in on the server can be an AI provider, managed only by the Owner

Status: accepted (2026-10-31). Risk lane: Red (runs a process, provider credentials, `src/lib/ai`).

## Context

The Owner wants to use Claude Code, Codex or OpenCode as a model without an API key, on the CLI's own
login, the way desktop tools list "Local CLI" next to "API providers". Saqina is a web app: it can only
start a program on the machine that serves it, never on a visitor's laptop.

## Decision

- A new adapter, `local_cli`, behind the same `AiProvider` interface. It has no key: `withProviderSecret`
  hands it an empty string and the CLI's own login on the server does the work.
- It is **off by default**, with an on/off switch for the Owner (`platform_ai_settings.local_cli_enabled`,
  audited as `provider.cli_enabled` / `provider.cli_disabled`). While it is off nothing is detected,
  connected or run, and it is read on every call, so switching off stops existing CLI providers at
  once without deleting them. Testing while off says so and does not mark the provider as failing.
- Only the platform Owner can see, connect, test, switch off or disconnect one (`requirePlatformOwner`
  in every call); each change is audited (`provider.cli_connected`, and the usual provider events).
  The generic provider form cannot create a `local_cli` provider.
- Only three binaries are ever started (`claude`, `codex`, `opencode`), by a fixed command built in
  `ai/cli/definitions.ts`. Nothing a person or project wrote becomes part of the command line; the
  prompt goes in through stdin or a file.
- Every run: a new empty temporary directory (removed afterwards), no shell, an environment cut down
  to the home, the search path and proxy settings (never the database URL or Saqina's keys), a time
  limit, an output cap, and the caller's abort signal. Claude Code runs with `--tools ""`, Codex in a
  read-only sandbox, so the CLI answers and cannot change files or run commands. Only a failure code
  leaves the module, never what the process printed.
- Structured answers (plans, reviews) ask for JSON in the prompt, are parsed and checked against the
  same zod schema, and are asked again once before failing.

## Consequences

- On Vercel there are no CLIs, so the section shows "Not installed". It is for a self-hosted server or
  a development machine. A bridge to a person's own laptop would be a separate decision.
- The CLI's login is the server user's login, shared by everything that uses that provider. Treat the
  server account as the Owner's account for that CLI.
- A CLI answers when it is done, so there is no token streaming; the whole text arrives at once.
- Claude Code was run against this implementation. Codex and OpenCode follow their documented flags
  and have not been run here.
