# 13. Publishing to Vercel: Saqina's team by default, the client's own on request

Status: accepted (2026-10-29). Risk lane: Red (deploys, secrets, domains).

## Context

Projects built in Saqina need a place to run: `<project>.saqina.dev`. Clients may want their own
Vercel account instead. Nothing connected to Vercel before.

## Decision

- **Default: Saqina's Vercel team.** `VERCEL_TOKEN` and `VERCEL_TEAM_ID` from the environment. The
  wildcard `*.saqina.dev` is attached to Saqina's Vercel once; each project gets a Vercel project
  connected to its GitHub repository and the domain `<slug>.saqina.dev`.
- **Optional: the client's own Vercel.** The client's token (and team) is stored encrypted for that
  project only, in `credentials` (`kind: deploy`). It is used only for that project, and Saqina's token is
  never used for it. A custom domain is allowed only here.
- **A person presses Publish.** Publish makes sure the Vercel project and domain exist and starts a
  production deployment of the default branch. Saqina never deploys on its own (PRD A3). Status comes back
  through the repository's deployment events and a refresh from Vercel.
- The client is a plain REST client with a timeout; error bodies are never surfaced, only a code.

## Consequences

- Vercel's GitHub app must be able to see the repository; the error says so.
- Removing a target revokes the client's token; the Vercel project itself is left alone.
