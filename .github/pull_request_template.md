## What and why

<!-- One or two sentences. Link the issue or plan. -->

## Risk lane

<!-- The riskiest path this touches. See docs/standards/governance.md and CODEOWNERS. -->

- [ ] Green (UI, copy, docs, tests)
- [ ] Yellow (business logic, actions, pages)
- [ ] Red (auth, authorization, billing, personal data, secrets, providers, MCP/agents, migrations, API routes)

## AI attribution

- Tool and model:
- Involvement: [ ] none  [ ] assisted  [ ] co-written  [ ] generated
- Red lane written or assisted by AI: adversarial review done? [ ] yes (link) [ ] not applicable

## Definition of done

- [ ] Authorization checked on the server, with a test for a stranger, a viewer and a signed-out visitor
- [ ] Input validated on the server; no user text rendered as HTML
- [ ] Loading, empty and error states, English and Indonesian
- [ ] Works at 320 / 768 / 1280 px, no horizontal scroll, targets ≥ 44 px, keyboard usable
- [ ] Queries indexed, no N+1; logs and audit events carry no secrets or personal data
- [ ] Failure paths tested (empty, null, timeout, concurrent)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass
- [ ] Docs updated (README, ADR, runbook as needed)
- [ ] User guide in `src/content/docs/` updated in English and Indonesian (with screenshots) for every visible change

## Migration and rollout

- [ ] No migration  [ ] Migration is expand-only (the previous deployment still works)
- Notes (env vars, order of steps, how to roll back):
