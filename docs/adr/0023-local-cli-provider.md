# 23. A CLI logged in on the server can be an AI provider, managed only by the Owner

Status: accepted (2026-10-31). Risk lane: Red (runs a process, provider credentials, `src/lib/ai`). Superseded by [ADR 0030](0030-v1-billing-focus.md): the feature was removed in v1.

## Context

The Owner wants to use Claude Code, Codex, OpenCode or Kiro CLI as a model without an API key, on the CLI's own
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
- Only four binaries are ever started (`claude`, `codex`, `opencode`, `kiro-cli`), by a fixed command built in
  `ai/cli/definitions.ts`. Nothing a person or project wrote becomes part of the command line; the
  prompt goes in through stdin or a file.
- Every run: a new empty temporary directory (removed afterwards), no shell, an environment cut down
  to the home, the user name (Claude Code finds its login in the macOS Keychain under it), the search path and proxy settings (never the database URL or Saqina's keys), a time
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
- Kiro CLI was added on 2026-11-05 at the Owner's request: `kiro-cli chat --no-interactive --trust-tools=
  --trust-workspace`, prompt on stdin, plain text as the answer. `--trust-tools=` with no names gives it no
  tools. It was run end to end on a development machine. Its login lives in the server user's home.

## Addendum (2026-11-06): policy risk

A CLI signed in with a ChatGPT or Claude subscription can go against the provider's terms and get the
account suspended or banned. So the switch needs the Owner to accept that risk (recorded in the audit
event, `riskAccepted`), is refused on a hosted platform (`VERCEL`), and the page says so before it turns on.
Use it only on a machine you run yourself, with an account you can afford to lose.
