# Saqina engineering standards

These standards apply to every change in this repository, whoever or whatever writes it: a person,
the assistant, an agent, or a tool. Read the page for the area you touch before you start, and
tick the checklist below before you open a pull request.

| Area | Page |
|---|---|
| Code structure, SOLID, naming, dependencies | [architecture.md](architecture.md) |
| UI, UX, accessibility, mobile | [ui-ux.md](ui-ux.md) |
| Security | [security.md](security.md) |
| Testing | [testing.md](testing.md) |
| Performance and scalability | [performance.md](performance.md) |
| CI/CD, rollback, environments, dependency provenance | [delivery.md](delivery.md) |
| Observability and monitoring | [observability.md](observability.md) |
| Privacy, retention, AI disclosure, licences | [compliance.md](compliance.md) |
| White label: branding the client portal | [white-label.md](white-label.md) |
| Ownership, risk lanes, review, AI attribution | [governance.md](governance.md) |
| AI agents: PRD and plan workflow (Superpowers, Ruflo, antislop), install check | [ai-agents.md](ai-agents.md) |
| README, ADRs, runbook, API docs | [documentation.md](documentation.md) |

## Status of each rule

Every rule is marked so nobody mistakes an aspiration for a guarantee:

- **Enforced**: a tool or a test fails when it is broken.
- **Planned**: agreed, with a track that builds the enforcement. Follow it anyway.
- **Manual**: needs a person (review, device testing, incident handling).

## Definition of done (copy into the pull request)

- [ ] Risk lane stated (see [governance.md](governance.md)); Red lane has a human reviewer.
- [ ] Authorization is checked on the server, and a test shows a stranger gets NOT_FOUND or a refusal.
- [ ] Input is validated on the server (zod); user text is never rendered as HTML.
- [ ] Every async screen has loading, empty and error states, in English and Indonesian.
- [ ] Works at 320, 768 and 1280 px with no horizontal scroll; touch targets are at least 44 px.
- [ ] Keyboard and screen-reader usable (WCAG 2.1 AA); contrast checked.
- [ ] New queries have an index or a stated reason; no query inside a loop.
- [ ] Logs and audit events carry no secrets and no personal data.
- [ ] Tests cover the happy path and the failure paths (empty, null, timeout, concurrent).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass.
- [ ] Portal-facing change: white-label rules respected ([white-label.md](white-label.md)).
- [ ] Docs updated (README, ADR for a decision, runbook for an operational change).
- [ ] AI-written code: attribution filled in, adversarial review done for Red lane.

## Where the rules live in code

`AGENTS.md` and `CLAUDE.md` point here, so an AI tool starts from these pages. When a rule changes,
change the page and the check that enforces it in the same pull request.
