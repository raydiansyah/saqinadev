# Documentation

| Document | Where | Must contain | Status |
|---|---|---|---|
| PRD | `docs/PRD.md` | Users, goals, non-goals, requirements with a status each (Built, Partial, Planned), open questions; the page every change is checked against | Present |
| README | `README.md` | What Saqina is, prerequisites, local setup, **every environment variable** (also `.env.example`), scripts, test and deploy steps, links to standards | Planned (expand) |
| Standards | `docs/standards/` | These pages | Present |
| ADRs | `docs/adr/NNNN-title.md` | Context, decision, consequences, status (MADR format); one per significant decision | Planned |
| Runbook | `docs/runbook.md` | Deploy, migrate, rollback, incident response, rotate a secret, restore a database branch, contacts | Planned |
| Incident reviews | `docs/incidents/` | Template plus one file per incident | Planned |
| API docs | `docs/api/openapi.yaml` | The `/api/*` routes that have outside callers: health, MCP, webhooks, cron | Planned |
| User guides | `src/content/docs/<owner\|client>/<en\|id>/*.md`, screenshots in `src/content/docs/assets/` | Step-by-step guides for the team and for clients, with real screenshots taken from the running product; signed-in readers only, per audience | Present |
| Context file | `AGENTS.md`, `CLAUDE.md` | Points to the standards and the repository facts a tool needs; updated when conventions change | Present |

## Rules

- A pull request that changes behaviour, configuration, an endpoint or an operational step changes the
  matching document in the same pull request.
- A change a user can see (a new screen, button, setting, rule or message) updates the matching user
  guide in `src/content/docs/` in **both** English and Indonesian, with its screenshots, in the same
  pull request. A feature with no guide yet gets a section in the closest guide. The pull request lists
  the guide pages it changed; "docs to follow" is not done.
- A change to a flow that a user guide shows changes that guide and its screenshots in the same pull request.
  Screenshots come from the real product on a local database seeded with demo data, never from production.
- Write for the person on call at 3 a.m.: exact commands in code blocks, one command per block,
  expected output, what to do when it fails.
- Prompt and context history that shaped a decision (plan files, design notes) is summarised into an ADR;
  the ADR is the record, not the chat.
- Do not duplicate: link to the code or the standard instead of copying it.
