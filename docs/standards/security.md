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
| Server-side request forgery | The server fetches no URL a person supplied. |
| Cryptographic failures | Passwords are hashed by the auth library; tokens are compared in constant time; secrets live only in the hosting environment. |
| Vulnerable components | SCA in CI (see [delivery.md](delivery.md)). |
| Logging failures | Audit sensitive actions; never log secrets or personal data. |

## Files and uploads

A logo is read from its bytes: only PNG and JPEG pass, at most 200 KB and 32 to 1600 px. SVG is refused
because it can carry script. The logo is served only to the organization's people and its clients, with
`nosniff` and a sandbox CSP, and not at all while white label is closed. PDF files are built from stored
records on request, behind the same access check as the page they mirror, with a rate limit per person.
Tests: `tests/integration/brand.test.ts`, `tests/integration/pdf-delivery.test.ts`.

## Row Level Security (Planned: defense in depth, in stages)

Application authorization stays the primary control. RLS is added underneath for tables with personal
or client data: the connection sets the acting user per transaction, policies filter by it, and the
application role has no `BYPASSRLS`. A test must show a query with no actor returns nothing. The first
tables are clients, client users and meeting notes; project tables follow.
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
