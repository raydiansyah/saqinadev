# 17. A person's own AI gateway in the Studio chat

Status: accepted (2026-10-29). Risk lane: Red (secrets, data leaving to a provider, provider access).

## Context

People want to answer in the Studio chat with their own model (ChatGPT/OpenAI, Claude, Gemini or a
custom endpoint) instead of, or next to, the platform default.

## Decision

- **API key only, for now.** The person pastes their own API key. Saqina checks it with the provider
  before storing anything; a refused key is never stored. Adapters: `openai`, `anthropic`, `gemini`,
  `openai_compatible` (own endpoint, checked by the SSRF guard), `anthropic_compatible`.
- **Theirs alone.** `ai_providers.owner_user_id` marks a personal gateway; its key is a `user`-scope
  credential opened only for its owner (`withSecret` checks the user). The platform catalog,
  the owner's pages, defaults and agent mappings never include it, and nobody else can list, pick or
  remove it (NOT_FOUND). The key is never returned, logged or audited.
- **The platform policy still rules.** A personal gateway sends text to a provider the platform did
  not set up, so it counts as an external provider: it can be added and used only while
  `allowExternalProviders` is on. The owner's allow-lists name platform providers and do not apply; a
  project's own model allow-list still does.
- **No silent fallback.** If the person picks their own model and it cannot answer, the platform's
  models are not tried; the rules answer from project data and the reasons are shown. The chosen
  model also does the intent and tool-choice calls of that message. Background work (conversation
  summary, memory extraction) still uses the platform's models.

## Provider terms (checked 2026-10-29, from secondary reports; confirm against each provider)

- **Anthropic:** Claude Free, Pro and Max subscription OAuth is for Claude Code and claude.ai only;
  using it in other apps is reported as a terms violation (clarified February 2026). Third-party apps
  use a Console API key. **Not built.**
- **OpenAI:** API keys are billed separately from ChatGPT plans. A "Sign in with ChatGPT" option for
  third-party apps is reported (October 2026) but its terms, client registration and per-app caps could
  not be confirmed from OpenAI's own pages. **Not built yet:** it needs a registered client and the
  official protocol.
- **Google:** Gemini API supports OAuth with the user's own Google Cloud client; reusing Gemini CLI
  subscription login in other software is reported as a violation. Not built.

## Consequences

- Without an owner-set external-providers switch on, nothing here works; the picker says so.
- A person who removes a gateway revokes its key; the models go with it.
- Adding ChatGPT sign-in later is a new adapter and credential kind, behind its own ADR once the
  terms are confirmed.
