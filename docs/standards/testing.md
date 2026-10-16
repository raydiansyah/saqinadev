# Testing

Tests run with Vitest. Integration tests use a real PostgreSQL database (`DATABASE_URL_TEST`, the name
must contain `_test`); there is no database mock. Layout: `tests/<domain>/*.test.ts` for pure logic,
`tests/integration/*.test.ts` for services against the database.

## Layers and minimums

| Layer | Minimum | Status |
|---|---|---|
| Unit (pure functions) | Every pure module has a test file; branches covered | Enforced by review |
| Coverage | Baseline never drops; **new and changed files ≥ 85%** (AI-written code is held to the higher bar) | Planned (CI ratchet) |
| Integration | Every service function and every route handler with its database interaction | Enforced by review |
| E2E | Core journey: sign in → create or import a project → requirements, PRD, tasks → sign out, at 320, 768 and 1280 px | Planned (Playwright) |
| Security | IDOR matrix, XSS payloads, SQL-injection strings, auth bypass on actions | Planned, partly present |
| Failure path | Empty list, null/missing field, provider timeout or 401, concurrent writers | Enforced by review |
| Adversarial review | A separate prompt or reviewer whose only job is to find bugs in the generated change; mandatory for Red lane | Manual |

## Rules for a good test

- Test behaviour through the public function, not private details. Inject fakes through the
  options the code already exposes (`{ adapter, provider }`), do not monkey-patch internals.
- Each test sets up its own data (`resetDatabase`, `createUser`, `project` helpers) and asserts the
  failure path next to the success path.
- Assert that nothing changed when an action is refused (row counts, no side effects).
- A bug fix starts with a test that fails for the right reason.
- Security-relevant claims are tested, not asserted in comments: price privacy, "never replaced an
  edited document", "token never leaves the server".

## Failure-path checklist

- [ ] Empty collection, single item, maximum size.
- [ ] Null/undefined optional fields; control characters in text.
- [ ] Network failure, 401/403/429/5xx from a provider (`vi.stubGlobal("fetch", …)`).
- [ ] Two writers at once (the row lock path), a repeated request (idempotence).
- [ ] Wrong actor: stranger, viewer, other client, signed out.
- [ ] Rate limit reached.
