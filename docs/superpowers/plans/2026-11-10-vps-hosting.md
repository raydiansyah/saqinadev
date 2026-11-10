# VPS hosting (harness phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saqina runs on the owner's Instabox VPS with Docker Compose and Postgres moved off Neon. The execution queue is picked up every minute, backups go off the machine nightly with a tested restore, and the owner can roll back by tag.

**Architecture:** One image is built in CI from a Next.js `standalone` build and pushed to GHCR.
- Compose runs it twice: as `web`, and as `scheduler`, a dependency-free Node loop that calls the existing cron routes with `CRON_SECRET`.
- Compose also runs `postgres` (pgvector) and `caddy` (TLS, Cloudflare in front).
- The database moves from Neon with `pg_dump` and `pg_restore` and is checked with per-table row counts before DNS changes.
- No application logic changes beyond the hosted check and the health commit.

**Tech Stack:** Next.js 16.4 `output: "standalone"`, Node 24, pnpm 10, Docker Compose, `pgvector/pgvector:pg17`, Caddy 2, Tailscale, GitHub Actions + GHCR, curl `--aws-sigv4` for R2, Vitest.

**Spec:** [2026-11-10-agent-harness-design.md](../specs/2026-11-10-agent-harness-design.md), section 1 and phase 1. Decision: [ADR 0028](../../adr/0028-host-on-a-vps-with-docker.md). Risk lane: Red (hosting, database move). PRD rows H1 and E12.

## Global Constraints

- VPS: Instabox, 4 vCPU, 8 GB RAM, **20 GB disk**. Disk is the binding limit:
  - Container logs are rotated at 10 MB × 3 files per service.
  - Postgres `max_wal_size` is 512MB.
  - Two image tags are kept: the current one and the one before.
  - Backups are streamed to R2 and never stay on the disk.
  - A deploy refuses to start with less than 3 GB free.
- Memory limits: `postgres` 3g (`shared_buffers=1GB`, `effective_cache_size=3GB`), `web` 2g, `scheduler` 256m, `caddy` 256m. The rest is left for the OS and Tailscale.
- Schedules, in UTC, copied from `vercel.json`:
  - `executions`: every minute;
  - `reminders`: 01:00;
  - `maintenance`: 01:30;
  - `doc-sync`: 02:00.
  - Backup: 18:00 UTC (01:00 WIB).
- Cron calls carry `Authorization: Bearer $CRON_SECRET` (`src/lib/cron/auth.ts`). A run of a job never overlaps another run of the same job.
- `hostedServer()` is true when `SAQINA_HOSTED=1` or `VERCEL` is set. The VPS sets `SAQINA_HOSTED=1`.
- Postgres listens only on the Compose network. The host exposes only 80 and 443 (via Caddy). SSH is reachable only on the Tailscale address.
- Caddy trusts `X-Forwarded-For` only from Cloudflare's published ranges, so the first address the app reads is the real client.
- Neon is dumped from its **direct** endpoint (a hostname without `-pooler`), with a `pg_dump` major version ≥ the Neon server's. Neon stays untouched for 14 days after the cutover.
- Secrets live only in `/opt/saqina/.env` on the VPS (mode 600), never in git or in the image. `deploy/env.example` lists names only.
- Migrations stay expand-only. Files stay under 400 lines. No `Co-Authored-By`. Commit only with the owner's go-ahead.
- Tests: `pnpm exec vitest run <file>`; integration tests need `DATABASE_URL_TEST` (a database whose name contains `_test`).

## Review Focus

1. **Spoofed `X-Forwarded-For`.** A client sends its own `X-Forwarded-For`; rate limits and MCP logs must still see the real address, not the forged one. Covered by the Caddy check in Task 4.
2. **A long drain overlapping the next minute.** `executions` can take 240 s, and the scheduler must not start a second call for the same job while one runs. Covered by `scheduler.test.ts` "skips a job that is still running" in Task 3.
3. **Disk filling up.** A deploy with < 3 GB free stops before pulling, and the backup leaves no file behind. Covered by the `deploy.sh` guard and the `backup.sh` cleanup check in Tasks 5 and 6.
4. **Restore into an empty server.** The dump needs the `vector` extension and must restore into a database that has never seen the schema. Covered by the restore drill in Task 6, which checks `pg_extension` and the row counts.
5. **Dumping through the Neon pooler.** `-pooler` hostnames give a broken dump. `move-from-neon.sh` refuses them. Covered in Task 7.

---

### Task 1: Hosted check and commit id that do not depend on Vercel

**Files:**
- Modify: `src/lib/ai/cli/service.ts:51-52`
- Modify: `src/app/api/health/route.ts:31`
- Modify: `.env.example` (add `SAQINA_HOSTED` and `GIT_COMMIT_SHA` with comments)
- Modify: `src/lib/services/env-files.ts:82`, `src/lib/env-vars/rules.ts:10` (add `SAQINA_HOSTED|GIT_COMMIT_SHA` to `PROVIDED`)
- Test: `tests/integration/local-cli.test.ts`, `tests/integration/health.test.ts` (new)

**Interfaces:**
- Produces: `hostedServer(): boolean`, which is true when `process.env.SAQINA_HOSTED === "1"` or `process.env.VERCEL` is set. The health JSON gains no field; `commit` reads `GIT_COMMIT_SHA ?? VERCEL_GIT_COMMIT_SHA`, sliced to 7.

- [ ] **Step 1: Write the failing tests.** In `local-cli.test.ts`, next to the `VERCEL` case, set `process.env.SAQINA_HOSTED = "1"`. Expect `(await listClis(owner)).hosted` to be `true` and `setCliEnabled(owner, { enabled: true, acknowledge: true })` to give `"VALIDATION_ERROR:cliHosted"`. Then delete the variable. In `health.test.ts`, set `GIT_COMMIT_SHA = "abcdef1234"` and expect `commit` to be `"abcdef1"`.
- [ ] **Step 2: Run them.** `pnpm exec vitest run tests/integration/local-cli.test.ts tests/integration/health.test.ts`. Expected: FAIL on both new expectations.
- [ ] **Step 3: Implement** both one-line changes. Update the doc comment of `hostedServer` to "a server Saqina is hosted on (the VPS sets `SAQINA_HOSTED=1`; Vercel sets `VERCEL`)".
- [ ] **Step 4: Run them again.** Expected: PASS. Then `pnpm lint && pnpm typecheck`.
- [ ] **Step 5: Commit** `feat: hosted check and health commit without Vercel`.

### Task 2: Standalone image

**Files:**
- Modify: `next.config.ts` (add `output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined`; change the comment "The app is served by Vercel" to "Do not advertise the framework")
- Create: `Dockerfile`, `.dockerignore`
- Create: `.github/workflows/image.yml`

**Interfaces:**
- Produces: image `ghcr.io/raydiansyah/saqinadev:<sha>` and `:main`.
  - The working directory is `/app`. `node server.js` serves on port 3000.
  - `scripts/scheduler.mjs` is present (Task 3).
  - `src/content/docs` is copied to `/app/src/content/docs`, because `src/lib/docs/content.ts` reads it from `process.cwd()` at request time.
  - `src/lib/db/migrations` and a bundled `migrate.mjs` are present for Task 5.
  - The build arg `GIT_COMMIT_SHA` becomes the env of the same name.

- [ ] **Step 1: Write the Dockerfile** with three stages on `node:24-slim`:
  - `deps`: `corepack enable`, `pnpm install --frozen-lockfile`.
  - `build`: `NEXT_OUTPUT=standalone pnpm build`, then `pnpm exec esbuild scripts/migrate.ts --bundle --platform=node --format=esm --outfile=dist/migrate.mjs --alias:@=./src --packages=external`. If `esbuild` is not a direct dependency, use the copy Next ships, or add `esbuild` to devDependencies. Check `pnpm why esbuild` first.
  - `run`:
    - copy `.next/standalone` to `/app`, `.next/static` to `/app/.next/static`, `public` to `/app/public`, `src/content` to `/app/src/content`, `src/lib/db/migrations` to `/app/src/lib/db/migrations` (the path `migrate.ts` reads), `dist/migrate.mjs` to `/app/migrate.mjs` and `scripts/scheduler.mjs` to `/app/scripts/scheduler.mjs`;
    - copy `node_modules/pg` and `node_modules/drizzle-orm` from `deps` if standalone tracing left them out of `migrate.mjs`'s reach;
    - run as user `node`, `EXPOSE 3000`, `CMD ["node","server.js"]`.
- [ ] **Step 2: `.dockerignore`.** Exclude `.git`, `node_modules`, `.next`, `.env*` except `.env.example`, `tests`, `e2e`, `coverage`, `docs`.
- [ ] **Step 3: Build locally.** `docker build --build-arg GIT_COMMIT_SHA=$(git rev-parse HEAD) -t saqina:local .` Expected: success, and `docker image ls saqina:local` under 600 MB. If the sandbox has no Docker daemon, run this step on the VPS or in CI and say so in the PR.
- [ ] **Step 4: Smoke the container.** Run `docker run --rm -p 3000:3000 --env-file <test env with DATABASE_URL to a migrated _test db, BETTER_AUTH_SECRET, SAQINA_ENCRYPTION_KEY, SAQINA_HOSTED=1> saqina:local`, then `curl -s localhost:3000/api/health`. Expected: `"status":"ok"` with a 7-character `commit`. Then sign in as the seeded owner in a browser and open `/en/dashboard/docs`. Expected: the guide list renders, which proves `src/content/docs` is in the image.
- [ ] **Step 5: Write `image.yml`.**
  - It runs on push to `main` and on manual dispatch, with `permissions: contents: read, packages: write`.
  - Steps: `docker/login-action` to GHCR with `GITHUB_TOKEN`, then `docker/build-push-action` with tags `:${{ github.sha }}` and `:main`, build arg `GIT_COMMIT_SHA`, and cache `type=gha`.
  - Leave `ci.yml` unchanged except for its header comment, which should say images are built by `image.yml`.
- [ ] **Step 6:** `pnpm lint && pnpm typecheck && pnpm build`. The Vercel build must still pass, because `NEXT_OUTPUT` is unset there.
- [ ] **Step 7: Commit** `build: standalone Docker image published to GHCR`.

### Task 3: Scheduler

**Files:**
- Create: `scripts/scheduler.mjs` (plain ESM, no imports outside `node:*`)
- Test: `tests/ci/scheduler.test.ts`

**Interfaces:**
- Produces:
  - `export const JOBS: ReadonlyArray<{ name: string; path: string; at: { everyMinute: true } | { hour: number; minute: number } }>` with the four schedules from Global Constraints.
  - `export function dueJobs(now: Date, lastRun: Map<string, number>, running: Set<string>): string[]`. It returns the names due in the UTC minute of `now` that have not run in that minute and are not running.
  - `async function main()` runs only when the file is executed directly (`import.meta.url === pathToFileURL(process.argv[1]).href`).
- `main` behaviour:
  - It reads `SCHEDULER_TARGET` (default `http://web:3000`) and `CRON_SECRET`, and exits 1 if the secret is missing.
  - It ticks every 15 s and fires each due job with `fetch(target + path, { headers: { authorization: "Bearer " + secret }, signal: AbortSignal.timeout(300_000) })`.
  - It logs one JSON line per run: `{ job, status, ms }`, without the response body.

- [ ] **Step 1: Write the failing tests.**
  - `dueJobs(new Date("2026-11-10T01:30:20Z"), new Map(), new Set())` equals `["executions","maintenance"]`.
  - The same minute with `lastRun` holding both at that minute equals `[]`.
  - "skips a job that is still running": with `running = new Set(["executions"])` at `01:31:00Z` the result is `[]`.
  - `02:00` gives `["executions","doc-sync"]`.
  - `01:00` gives `["executions","reminders"]`.
- [ ] **Step 2:** `pnpm exec vitest run tests/ci/scheduler.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `scripts/scheduler.mjs`.
- [ ] **Step 4:** Run the test again. Expected: PASS. Then run `CRON_SECRET=x SCHEDULER_TARGET=http://127.0.0.1:9 node scripts/scheduler.mjs` for 20 s. Expected: one `executions` line with a connection-refused status, and the process still running.
- [ ] **Step 5: Commit** `feat: scheduler that calls the cron routes every minute`.

### Task 4: Compose, Caddy and the server

**Files:**
- Create: `deploy/compose.yaml`, `deploy/Caddyfile`, `deploy/postgres.conf`, `deploy/env.example`, `deploy/cloudflare-ips.sh`
- Modify: `docs/runbook.md` (new section "VPS (Instabox)": first-time server setup)

**Interfaces:**
- Produces: services `web`, `scheduler`, `postgres` and `caddy` on network `saqina`.
  - Volumes: `pgdata` and `caddy_data`.
  - `web` and `scheduler` use `image: ghcr.io/raydiansyah/saqinadev:${SAQINA_TAG}` and `env_file: /opt/saqina/.env`.
  - `scheduler` overrides the command to `node scripts/scheduler.mjs`.
  - `web` has `DATABASE_URL=postgres://saqina:${POSTGRES_PASSWORD}@postgres:5432/saqina` with no `sslmode`, and `DATABASE_POOL_MAX=20`.
  - `deploy/cloudflare-ips.sh` writes `deploy/cloudflare-ips.caddy`, a `trusted_proxies static …` line built from `https://www.cloudflare.com/ips-v4` and `ips-v6`.

- [ ] **Step 1: Write `compose.yaml`.**
  - Healthchecks: `pg_isready` for postgres, `wget -qO- localhost:3000/api/health` for web (or `node -e fetch` if wget is absent in slim).
  - `depends_on` with `condition: service_healthy`.
  - `logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }` on every service, and `mem_limit` values from Global Constraints.
  - `restart: unless-stopped`. Only `caddy` publishes ports (80, 443). `postgres` runs with `command: postgres -c config_file=/etc/postgresql/postgres.conf`.
- [ ] **Step 2: `postgres.conf`.** Set `listen_addresses='*'` (the network is internal), `shared_buffers=1GB`, `effective_cache_size=3GB`, `max_wal_size=512MB`, `max_connections=60` and `log_min_duration_statement=500`.
- [ ] **Step 3: `Caddyfile`.**
  - A site block for the domain (from env `SAQINA_DOMAIN`) that does `reverse_proxy web:3000`.
  - `import cloudflare-ips.caddy` inside `servers { … }` global options, with `client_ip_headers CF-Connecting-IP X-Forwarded-For`.
  - `header -Server`. Request bodies up to 25 MB, so chat attachments of 5 × 5 MB fit.
- [ ] **Step 4: `env.example`.** It holds every name from `.env.example` that production uses, plus `SAQINA_HOSTED=1`, `SAQINA_TAG`, `SAQINA_DOMAIN`, `POSTGRES_PASSWORD`, `BACKUP_R2_*` and `GIT_COMMIT_SHA`. Names only, no values. Drop `ALLOW_LOCAL_*`, `DEV_*` and `PLAYWRIGHT_*`.
- [ ] **Step 5: Validate.** `docker compose -f deploy/compose.yaml --env-file deploy/env.example config -q`. Expected: exit 0. (This needs only the docker CLI. If it is unavailable here, run it on the VPS.)
- [ ] **Step 6: Runbook "VPS (Instabox)".** Write each step as a command block:
  - create user `saqina`;
  - install Docker and the compose plugin;
  - install Tailscale (`tailscale up --ssh`);
  - set `PasswordAuthentication no`;
  - `ufw default deny incoming`, allow 80/443 only from the Cloudflare ranges (from the same script), and allow SSH only on `tailscale0`;
  - `/opt/saqina` holding `.env` (600) and the `deploy/` files;
  - Cloudflare DNS record proxied (orange), SSL mode Full (strict).
- [ ] **Step 7: Check on the VPS that a forged `X-Forwarded-For` is ignored.** Add `log { format json }` to the site block. From the laptop run `curl -s -H "X-Forwarded-For: 1.2.3.4" https://<domain>/api/health`. In `docker compose logs caddy`, the request's `client_ip` must be the laptop's public IP (`curl -s https://ifconfig.me`), not `1.2.3.4`. Write the result in the PR.
- [ ] **Step 8: Commit** `deploy: compose, caddy and postgres config for the VPS`.

### Task 5: Deploy and rollback

**Files:**
- Create: `deploy/deploy.sh`
- Modify: `.github/workflows/post-deploy.yml` (add `workflow_dispatch` with an input `url`, so the smoke test can run against the VPS)
- Modify: `docs/runbook.md` ("Deploy" and "Roll back the application" sections now describe the VPS. The Vercel text moves under "Before 2026-11 (Vercel)" until the cutover is done.)

**Interfaces:**
- `deploy.sh <tag>`, run in `/opt/saqina`:
  1. It refuses if `df --output=avail -B1G / | tail -1` is < 3.
  2. `docker compose pull`, with `SAQINA_TAG=<tag>`.
  3. Migrations: `docker compose run --rm web node migrate.mjs`, with `DATABASE_URL` from the env.
  4. `docker compose up -d`.
  5. It waits up to 90 s for `/api/health` to report `commit` equal to the first 7 characters of `<tag>`.
  6. On success it writes `<tag>` to `/opt/saqina/CURRENT` and the previous tag to `PREVIOUS`, then runs `docker image prune` for every saqinadev tag except those two.
  7. On a health timeout it redeploys `PREVIOUS` and exits 1.

- [ ] **Step 1: Write `deploy.sh`** with `set -euo pipefail`. Every step prints one line.
- [ ] **Step 2: Shellcheck.** `shellcheck deploy/*.sh`. Expected: no findings. (Install it with `apt-get install shellcheck` if absent.)
- [ ] **Step 3: Dry check on the VPS** with the first real tag. Expected: a healthy `web` with the right `commit`. Then run `deploy.sh` with a bogus tag. Expected: the pull fails, nothing restarts, and exit is non-zero.
- [ ] **Step 4: Commit** `deploy: deploy and rollback by image tag`.

### Task 6: Backup and restore drill

**Files:**
- Create: `deploy/backup.sh`, `deploy/restore.sh`, `deploy/saqina-backup.service`, `deploy/saqina-backup.timer`
- Modify: `docs/runbook.md` ("Roll back the database" now restores from R2; "Backups" covers the R2 bucket, the 14-day lifecycle rule and the drill)

**Interfaces:**
- `backup.sh`:
  - runs `docker compose exec -T postgres pg_dump -U saqina -Fc saqina`, piped into `curl --fail --aws-sigv4 "aws:amz:auto:s3" --user "$BACKUP_R2_KEY:$BACKUP_R2_SECRET" -T - "$BACKUP_R2_ENDPOINT/$BACKUP_R2_BUCKET/saqina-$(date -u +%F).dump"`;
  - writes no file to disk and exits non-zero if either side fails (`set -o pipefail`).
- `restore.sh <date> <target-db>`:
  - downloads the dump with the same signing;
  - creates `<target-db>`, runs `CREATE EXTENSION IF NOT EXISTS vector`, then `pg_restore --no-owner --no-acl -d <target-db>`;
  - prints row counts for every table in `public`.
- The timer runs at 18:00 UTC daily, `Persistent=true`.

- [ ] **Step 1: Write both scripts** and the systemd units. Run shellcheck. Expected: clean.
- [ ] **Step 2: Run `backup.sh` once on the VPS.** Expected: an object in R2 bigger than 0 bytes, and `ls /tmp /opt/saqina` shows no new dump file.
- [ ] **Step 3: Drill.** `restore.sh <today> saqina_restore_check`. Expected:
  - `select extname from pg_extension where extname='vector'` gives one row;
  - the row counts equal those of `saqina` for the same tables;
  - then `dropdb saqina_restore_check`.

  Record the date and the result in the runbook.
- [ ] **Step 4: `systemctl enable --now saqina-backup.timer`** and `systemctl list-timers | grep saqina`. Expected: the next run is at 18:00 UTC.
- [ ] **Step 5: Commit** `deploy: nightly backup to R2 and a restore drill`.

### Task 7: Move the database off Neon and cut over

> Deferred (owner, 2026-11-10): the database stays on Neon for now (54 MB). The cutover of production to
> the VPS (DNS, smoke test, removing `vercel.json` crons) happens with the owner on the server.

**Files:**
- Create: `deploy/move-from-neon.sh`, `deploy/row-counts.sql`
- Modify: `vercel.json` (remove `crons` after the cutover, so Vercel and the VPS do not both run jobs), `docs/runbook.md` (cutover log), `docs/adr/0028-host-on-a-vps-with-docker.md` (status: accepted, with the date), `docs/PRD.md` (H1 Built; E12 schedule part Built), `README.md` (where it says the app is hosted on Vercel)

**Interfaces:**
- `move-from-neon.sh`:
  - reads `NEON_DIRECT_URL` and refuses if the host contains `-pooler`;
  - checks `pg_dump --version` major ≥ the server's `server_version_num / 10000`;
  - prints `pg_database_size` and refuses if the size × 3 > the free disk;
  - dumps `-Fc --no-owner --no-acl` to `/opt/saqina/neon.dump`, restores into the VPS `saqina` database (after `CREATE EXTENSION vector`), and runs `row-counts.sql` on both, printing a diff;
  - deletes `neon.dump` at the end, on success or failure (`trap`).
- `row-counts.sql`: one row per `public` table with an exact `count(*)`, built with `format()` and `\gexec`. It must be exact, not `pg_stat` estimates.

- [ ] **Step 1: Write the script and the SQL.** Shellcheck. Expected: clean.
- [ ] **Step 2: Rehearsal** against Neon while the app is live on Vercel. Expected: the diff is empty, apart from tables written during the dump. Note the duration and the dump size.
- [ ] **Step 3: Cutover window.** Announce it to clients if any are active. Then:
  - set Vercel to maintenance, or pause the project, so nothing writes to Neon;
  - run `move-from-neon.sh`. Expected: an empty diff.
  - `deploy.sh <tag>`;
  - point the Cloudflare DNS record at the VPS IP;
  - run the smoke test (`gh workflow run post-deploy.yml -f url=https://<domain>`, or `pnpm smoke https://<domain>` from a laptop). Expected: pass.
- [ ] **Step 4: Watch the queue.** Start a Plan execution on a test project. Expected: within 60 s the scheduler log shows `executions` with status 200, and the execution leaves `queued`.
- [ ] **Step 5: Fill in the dates** in the runbook cutover log, ADR 0028 "accepted (date)", PRD H1/E12, the README, and remove `vercel.json` crons. `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Expected: green.
- [ ] **Step 6: Commit** `docs: Saqina runs on the VPS; Neon kept 14 days as the way back`.
- [ ] **Step 7: After 14 days without a rollback,** the owner shuts down the Neon project. Record the date in the runbook.
