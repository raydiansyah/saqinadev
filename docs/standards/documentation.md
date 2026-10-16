# Documentation

| Document | Where | Must contain | Status |
|---|---|---|---|
| README | `README.md` | What Saqina is, prerequisites, local setup, **every environment variable** (also `.env.example`), scripts, test and deploy steps, links to standards | Planned (expand) |
| Standards | `docs/standards/` | These pages | Present |
| ADRs | `docs/adr/NNNN-title.md` | Context, decision, consequences, status (MADR format); one per significant decision | Planned |
| Runbook | `docs/runbook.md` | Deploy, migrate, rollback, incident response, rotate a secret, restore a database branch, contacts | Planned |
| Incident reviews | `docs/incidents/` | Template plus one file per incident | Planned |
| API docs | `docs/api/openapi.yaml` | The `/api/*` routes that have outside callers: health, MCP, webhooks, cron | Planned |
| Context file | `AGENTS.md`, `CLAUDE.md` | Points to the standards and the repository facts a tool needs; updated when conventions change | Present |

## Rules

- A pull request that changes behaviour, configuration, an endpoint or an operational step changes the
  matching document in the same pull request.
- Write for the person on call at 3 a.m.: exact commands in code blocks, one command per block,
  expected output, what to do when it fails.
- Prompt and context history that shaped a decision (plan files, design notes) is summarised into an ADR;
  the ADR is the record, not the chat.
- Do not duplicate: link to the code or the standard instead of copying it.
