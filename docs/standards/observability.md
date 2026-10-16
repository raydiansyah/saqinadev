# Observability and monitoring

## Signals

| Signal | Tool | Status |
|---|---|---|
| Errors and traces | Sentry (`@sentry/nextjs`) with PII scrubbed in `beforeSend` | Planned |
| Structured logs | `src/lib/log.ts`: one JSON line per event, secrets redacted by key and by shape | Enforced |
| Uptime | An external monitor on `/api/health` (200 + `database: true`) | Planned |
| Web vitals | `next/web-vitals` reported to Sentry; Lighthouse in CI | Planned |
| Audit trail | `recordAudit` for sensitive actions, readable by the owner | Enforced |
| Usage and cost | `ai_usage_records` per model call | Enforced |

## Logging rules

- Event names are `domain.action` (`meeting.analyze`, `github.connect_failed`). Fields are ids, codes and
  durations. **No email, name, phone, IP, free text from a user, or secret.** `redact()` is the backstop,
  not the plan.
- Every unexpected error returns a reference (`REQ-XXXX`) that appears in the log line and in the message
  the user sees, so support can find it.
- Add `requestId`, `projectId` and duration to a log line when you have them.

## Alerts (to configure with Sentry and the uptime monitor)

| Alert | Condition | Goes to |
|---|---|---|
| Downtime | Health check fails twice in a row | On-call |
| Error spike | Error rate > 2× the weekly baseline for 10 minutes | On-call |
| Latency | p95 above budget for 15 minutes | On-call |
| Cron failure | `/api/cron/*` returns non-2xx or does not run | Owner |
| Database | Connection or compute saturation (Neon) | On-call |
| AI provider | `ai_usage_records.status = failed` rate above 20% for a model | Owner |

## Origin metrics (AI vs human)

Tag events and releases with `origin` (`ai` or `human`) and `lane` (green, yellow, red), taken from the
pull request attribution (see [governance.md](governance.md)). The question to answer each month:
do AI-written changes cause more production errors or reverts than human ones, and in which lane.

## Incidents

Follow the [runbook](../runbook.md). After a production incident, write a post-incident review within
five working days using the template in `docs/incidents/TEMPLATE.md`: timeline, cause, what detected it,
what would have detected it sooner, follow-ups with owners.
