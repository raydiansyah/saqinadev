# Governance, ownership and review

## Ownership

| Role | Who | Responsibility |
|---|---|---|
| Product and code owner | _fill in_ (CODEOWNERS default: @raydiansyah) | Priorities, merges to `main`, policy decisions |
| On-call | _fill in_ | First responder for alerts; rotation and hours written here |
| Security contact | _fill in_ | Receives vulnerability reports; decides disclosure |
| Escalation | owner → on-call backup → hosting/vendor support | Defined in the [runbook](../runbook.md) |

An area without a named owner is not production-ready. Keep this table current.

## Risk lanes

Every pull request states one lane, chosen by the **riskiest path it touches**. Paths are listed in
`.github/CODEOWNERS` (which also routes review).

| Lane | Paths | Review |
|---|---|---|
| **Green** | `src/components/**`, `messages/**`, `src/content/**`, `docs/**`, `tests/**` (alone), styles | One reviewer or the author after the pipeline is green; AI may write freely |
| **Yellow** | Business logic: `src/lib/**` services (documents, projects, tasks, requirements, meetings, imports, docsync, ai/gateway), server actions, `src/app/**` pages | Human review of logic and tests; coverage ratchet |
| **Red** | Authentication and sessions (`src/lib/auth`, `src/proxy.ts`), authorization (`permissions`, `platform/roles`, portal access), billing and payments (`src/lib/billing`, money), personal data and clients, secrets and crypto (`src/lib/secrets`), providers and credentials (`ai/control-plane`, `github`), MCP/tools/agent permissions (`src/lib/mcp`, `tools`, `agents/capabilities`), security headers, migrations (`src/lib/db/migrations`, schema), cron and webhooks (`src/app/api/**`) | **A person reads and verifies every line or rewrites it.** Written or assisted by AI: a separate adversarial review ("find the bugs, assume the author is wrong") is attached to the PR. Two-person review when the owner is the author. |

When unsure, take the higher lane.

## AI attribution

Each pull request (and commit) records: the tool and model, how much it wrote (assist, co-write,
generated), and the lane. The `Co-Authored-By` trailer on commits is kept. This feeds the AI-versus-human
metrics in [observability.md](observability.md).

## AI usage policy

- Allowed: code, tests, docs, refactors, analysis, reviews, drafts that a person reviews.
- Not allowed: sending secrets, credentials, production data or another client's data to a model or into
  a prompt; letting a model merge, deploy, change permissions or touch production data without a person;
  adding dependencies or licences unreviewed.
- Model output is untrusted until validated and reviewed. Agents and MCP tools act only inside the
  permission they were granted and everything they do is audited.
- Customer documents go to a model only with the consent recorded for that action.

## Decisions and reviews

- Architecturally significant choices get an ADR in `docs/adr/` (context, decision, consequences).
- Production incidents get a post-incident review (see [observability.md](observability.md)); follow-ups
  have an owner and a date.
- Quarterly: review who has access, rotate long-lived secrets, re-read these standards.
