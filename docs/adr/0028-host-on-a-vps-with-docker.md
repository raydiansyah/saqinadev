# 28. Saqina runs on a VPS with Docker Compose, with a worker that never stops

Status: proposed (2026-11-10). Risk lane: Red (hosting, database move, scheduling).
Design: [agent harness spec](../superpowers/specs/2026-11-10-agent-harness-design.md).

## Context

- On Vercel Hobby a cron runs at most once a day, so `vercel.json` schedules the executions queue at
  02:15. Work that `after()` did not finish waits up to a day (PRD E12).
- The owner decided Saqina is a personal tool with one operator; clients keep the portal. Paying per
  seat for Vercel Pro buys little for one person.
- Cloudflare Workers was reviewed (2026-11-10). The free plan allows 10 ms CPU per request, which is too
  little to render the app. Workers Paid would work, but only after a migration:
  - `waitUntil` ends about 30 seconds after the response, too short for agent work;
  - the docs pages read files at runtime, and workerd has no filesystem;
  - a Node `proxy.ts` on workerd is experimental;
  - the cron needs a custom `scheduled` entry;
  - Postgres needs Hyperdrive.
- The agent harness ([ADR 0029](0029-agent-harness-with-runners.md)) needs a process that keeps running and
  long-held requests from runners.
- The database is on Neon today. A worker that checks the queue every minute and runner heartbeats every
  30 seconds would keep Neon's compute from ever scaling to zero. `LISTEN/NOTIFY` needs a direct
  connection, not the pooler. Pages were slow because of round trips to a distant database (measured
  2026-11-05).
- The owner chose Instabox for the VPS.

## Decision

- **One VPS on Instabox, Docker Compose**, with four services:
  - `web`: Next.js `output: "standalone"`;
  - `scheduler`: a dependency-free Node loop in the same image that calls the existing cron routes
    with `CRON_SECRET` (executions every minute; reminders, maintenance and doc-sync at their
    `vercel.json` times), one run of a job at a time;
  - `postgres`: with pgvector;
  - `caddy`: for TLS.
- The cron routes stay for manual runs and are guarded by `CRON_SECRET` as today. `after()` stays as the
  fast path; the scheduler is what guarantees progress. The `web` process keeps running, so a drain
  started by `after()` is not cut short.
- **Networking:**
  - Cloudflare provides DNS and the proxy for the public domain, with the existing cache rules.
  - The owner's routes and the runner API are also reachable on the Tailscale address.
  - Runners use only the Tailscale address.
- **Hosted check:** `hostedServer()` reads an explicit `SAQINA_HOSTED=1` instead of `VERCEL`. Without
  this, the local CLI provider would become available on the VPS.
- **Backups:** nightly `pg_dump` to object storage (R2 or S3), kept 14 days. The runbook records a restore
  test after each change to the backup.
- **Move off Neon.** `pg_dump` from Neon, restore on the VPS, test, then switch `DATABASE_URL`. Neon stays
  for two weeks as the way back, then it is shut down. Neon's point-in-time restore and branching are
  lost; nightly backups and the restore test replace them.
- **Vercel stays** for what it does for clients: preview and publish of client projects
  ([ADR 0013](0013-publishing-to-vercel.md)), using `VERCEL_TOKEN`.
- **Deploys:** an image is built in CI and tagged by commit, then pulled on the VPS. Rollback means
  running the previous tag. Migrations stay expand-only.

## Consequences

- The execution queue runs every minute, which closes PRD E12 without Vercel Pro.
- The owner now runs a server: OS updates, Docker updates, disk, backups and monitoring. The runbook
  gets a section for each.
- One VPS is a single point of failure. A restore from backup onto a new VPS is the recovery plan and
  must be tested.
- Vercel-only features are lost: preview deployments of Saqina itself and the Vercel CDN. Cloudflare
  covers caching of public pages.

## Out of scope

- Kubernetes, several regions, or a managed database. These can be added later if one VPS is not enough.
