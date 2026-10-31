# Security

## Authentication and authorization (Enforced by tests)

- Authorization is decided on the server, in the service, every time. The UI hiding a button is not a
  control. Patterns to reuse: `loadProjectAccess`, `requirePlatformOwner`, `clientParty`,
  `loadClientProjectAccess`.
- Not a member of something = `NOT_FOUND`, never "forbidden", so existence is not revealed.
- **IDOR test for every route and action that takes an id or slug**: a stranger, a viewer, a client of
  another project and an unauthenticated visitor must all fail. Change `/order/123` to `/order/124`
  in the test, not only in theory.
- Sessions, passwords and verification are Better Auth; password policy is enforced server-side
  (`src/lib/auth/password-policy.ts`).

## OWASP Top 10 checklist (review for every Yellow/Red change)

| Risk | Rule here |
|---|---|
| Injection | Drizzle with parameters only. No string-built SQL; `sql` template tags only with bound values. |
| XSS | React escapes; **no `dangerouslySetInnerHTML` with user data** (JSON-LD is the single exception and escapes `<`). User text is plain text; model output is data. |
| CSRF | Server actions and Better Auth origin checks; cookies `httpOnly`, `sameSite=lax`, `secure` in production. State parameters for OAuth (`src/lib/github/oauth.ts`). |
| Broken access control | Server checks above; RLS as a second layer (below). |
| SSRF | Outbound endpoints are validated with `assertSafeEndpoint` (`src/lib/net/endpoint-guard.ts`). |
| Cryptographic failures | Secrets sealed with AES-GCM (`src/lib/secrets`); tokens compared in constant time; webhook signatures verified. |
| Vulnerable components | SCA in CI (see [delivery.md](delivery.md)). |
| Logging failures | Audit sensitive actions; never log secrets or personal data. |

## Prompt injection (AI features)

Text from users, repositories, notes and web pages is **untrusted data**. It goes into `external` prompt
segments, never into the system prompt; model output is validated against a zod schema; anything a
model proposes changes nothing until a person with the right permission approves it.

Exception, narrow and enforced in `tools/policy.ts`: an agent in an execution may commit to that
execution's own work branch (`saqina/exec-*`) without approval, using only the tools frozen in its
definition snapshot. Main, pull requests, merges and deployments stay proposals. Messages between
agents reach the next agent as `external` data, and the execution event stream (SSE) requires
`project:read` and returns NOT_FOUND to non-members. See ADR 0020 and 0021.

## Running local programs (local CLI provider)

The only place Saqina starts an outside program for the model is `src/lib/ai/cli`. Rules: off by default,
switched on by the Owner (audited); Owner only; a fixed list of binaries with commands built in code, no shell, nothing
from a person or project in the arguments; a new empty directory per run; an environment cut to the home,
search path and proxy settings; a time limit and an output cap; a failure code and never the output
leaves the module. Tests: `tests/integration/local-cli.test.ts`. See ADR 0023.

## Row Level Security (Planned: defense in depth, in stages)

Application authorization stays the primary control. RLS is added underneath for tables with personal
or client data: the connection sets the acting user per transaction, policies filter by it, and the
application role has no `BYPASSRLS`. A test must show a query with no actor returns nothing. The first
tables are clients, client users, service inquiries, meeting notes and credentials; project tables follow.
Record the design as an ADR.

## Secrets (Enforced partly)

- Only environment variables or the encrypted credential store. Never in code, fixtures, tests, logs
  or commit messages. `.env*` files stay out of git.
- Secret scanning runs on every pull request (see [delivery.md](delivery.md)); a leaked secret is
  rotated first, removed from history second.
- Provider keys and tokens are read through `withSecret` inside a callback and are never returned.

## Headers, cookies and rate limits

- Security headers come from `src/lib/security-headers.ts` (CSP, HSTS in production, frame and
  content-type protections). A new third-party origin needs a CSP change reviewed in the same pull request.
- Every public or mutating endpoint has a rate limit keyed per user (or per IP when anonymous) with
  `allow()` from `src/lib/rate-limit.ts`; the key is `<domain>:<dimension>:<id>`.

## Audit logging

- `recordAudit` for sensitive actions (credentials, roles, exports, connections, approvals).
- Metadata holds ids and codes, not names, emails or free text. Secrets are scrubbed centrally.
