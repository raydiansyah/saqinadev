# Runbook

Commands run from the repository root. One command per block.

## Contacts

Owner, on-call and escalation: see [governance](standards/governance.md). Fill them in before launch.

## Health

```bash
curl -s https://www.saqina.dev/api/health
```

Expect `{"status":"ok","database":true,"fileStorage":true,...}`. `commit` is the deployed commit.
`fileStorage: false` means S3 is not configured and chat attachments are refused (see below).

```bash
pnpm smoke https://www.saqina.dev
```

## File storage (S3) for chat attachments

The store is S3-compatible (`src/lib/attachments/storage.ts`, via `aws4fetch`). AWS S3, Cloudflare
R2 and MinIO all work with the same five `S3_*` variables; no code change. The bucket must stay
private — files are served only through Saqina after an access check.

### AWS S3

1. Create a private bucket (block all public access).
2. Create an access key whose policy allows only `s3:PutObject`, `s3:GetObject` and
   `s3:DeleteObject` on `arn:aws:s3:::<bucket>/projects/*`.
3. Set `S3_BUCKET`, `S3_REGION` (the bucket's region, e.g. `ap-southeast-1`), `S3_ACCESS_KEY_ID`
   and `S3_SECRET_ACCESS_KEY` in Vercel for Production and Preview. Leave `S3_ENDPOINT` empty.
4. Redeploy, then verify (below).

### Cloudflare R2 (free egress)

R2 charges nothing for egress, so moving attachments here keeps their transfer off the Vercel bill.
Setup is configuration only.

1. **Bucket.** Cloudflare dashboard > R2 > Create bucket (e.g. `saqina-storage`). Do NOT enable
   public access.
2. **Token.** R2 > Manage R2 API Tokens > Create API token. This is an **Account API token** (R2's
   own token UI), not a User API token — only the R2 token mints the S3 Access Key ID / Secret pair.
   Permission: **Object Read & Write** (covers Put, Get and Delete). Scope it to the one bucket, not
   all buckets. Copy the Access Key ID, Secret Access Key and the S3 endpoint; the secret is shown
   once.
3. **Variables.** Set in Vercel for Production and Preview, then redeploy:
   - `S3_BUCKET=saqina-storage`
   - `S3_REGION=auto` — R2 ignores the region but the request signer still needs a value; `auto` is
     the one R2 documents.
   - `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com` — the account endpoint WITHOUT the
     bucket name; the code appends the bucket and uses path-style URLs when `S3_ENDPOINT` is set.
   - `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` from step 2.

### Verify (either store)

1. `/api/health` shows `"fileStorage":true` (`storageDriver()` returns `"s3"` once the four core
   variables are set). Locally, fill `.env.local` and run `pnpm smoke` or upload an attachment.
2. Attach a small image in a project's chat, then confirm an object appears under the
   `projects/<project id>/attachments/` prefix (S3 console or the R2 bucket view).

Objects are stored as `projects/<project id>/attachments/<uuid>`, never under the file name.
Uploads that were never sent are deleted by the daily maintenance cron after a day. Rotate the key
like any other secret ("Rotate a secret" below).

## Publishing client projects (Vercel) and repository events

**Saqina's Vercel team (default).**
1. Create a token for the team at <https://vercel.com/account/tokens>; set `VERCEL_TOKEN`,
   `VERCEL_TEAM_ID` and (if not `saqina.dev`) `SAQINA_PROJECTS_DOMAIN` in Vercel, then redeploy.
2. In the team, add the domain `*.saqina.dev` once and point its DNS to Vercel (nameservers or a
   wildcard record, as Vercel explains). Each project then gets `<slug>.saqina.dev` automatically.
3. Install the Vercel GitHub app on the GitHub organization that holds the client repositories, or
   Publish fails with "Vercel did not accept the request".
4. In a project: Studio > Publish. A client who wants their own account pastes their own Vercel token.

**Repository events (webhook).** Connecting a GitHub repository installs the webhook with the
project's token. If the token lacks admin rights on the repository, Studio > Git shows the URL and a
secret to add by hand (content type JSON; events push, pull request, check suite, workflow run,
deployment status). Turn events on again to rotate the secret.

**Local IDE agents.** A project admin creates a token under Settings > Agent access, chooses the
scopes (`write_tasks` to claim and report tasks, `use_mcp_tools` for connector tools), copies the
snippet for the IDE and downloads AGENTS.md into the repository.

## Databases and sign-in for a client's app

The keys are the client's own and live in `credentials` (kind `service`, project scope), sealed with
`SAQINA_ENCRYPTION_KEY`. If Publish says "not ready to preview", open Studio > Publish > Databases and
sign-in; each line names the variable and the reason. Fixes:

- **Neon:** create a branch of the database for the preview and paste its connection string as the
  Preview `DATABASE_URL`. The Live value is the main branch.
- **Supabase:** use a second project (or a branch) for the preview: its Postgres URL, project URL and
  keys go in the Preview column.
- **Clerk:** the Preview column takes the development instance keys (`pk_test_`, `sk_test_`).
- **Local column:** optional, for developers' machines; empty uses the Preview value. It may not equal
  the Live database or hold a live Clerk key. It goes to Vercel's `development` target (encrypted, as
  Vercel does not allow sensitive variables there) and into the `.env.local` download.
- **Env files:** `GET /api/projects/<slug>/env?file=example` (names, any member) and `?file=local`
  (values, project admins only, 20 per hour, audited as `service.env_downloaded` with names only).
- **"Variables not set up here" warning in the Studio:** the repository's `.env.example` names a
  variable Saqina does not have. Add the service or a custom variable with that name, or remove it from
  `.env.example` if the app no longer reads it.
- Changing a service on a published project sends the values to Vercel at once; the next deployment
  uses them. Values are never shown again; to rotate, enter a new one.
- Without `SAQINA_ENCRYPTION_KEY` keys cannot be stored (the form says so).

## Environment variables of a client's app

Managed by a project admin in the Studio, **Publish > Environment variables** (decision:
[ADR 0025](adr/0025-environment-variables-of-the-app.md)). Values are encrypted in `credentials` (kind `env`)
and sent to the project's Vercel project; they are never shown again.

- **A variable is not on Vercel.** The row shows "Not sent to Vercel yet" when the last send failed. Save the
  variable again or Publish; check the Vercel connection (token, team) first.
- **A removed variable is still on Vercel.** Removal there is best effort; the Studio says so when it
  failed. Delete it by hand in the Vercel project's settings.
- **Rotate a value.** Open Edit, type the new value in that environment, Save. Leave a field empty to keep it.
- **A build fails on a missing variable.** Compare the names with the repository's `.env.example` (the
  Studio lists the ones Saqina lacks and offers "Add these names"), fill the values, publish again.
- **Nothing to restore.** Removing a variable deletes its values; there is no undo.
- **Rotating `SAQINA_ENCRYPTION_KEY`** makes every value unreadable, like every other stored credential.

## Executions: Plan and Build with agents

An execution (a plan or a build started from the Studio) is worked by a queue in the database
(`execution_jobs`). It is worked in two places: after the response that started it, and by
`GET /api/cron/executions`, which takes every job that is due, including those a dead worker left
locked. Decisions: [ADR 0020](adr/0020-execution-engine.md), [0021](adr/0021-agents-commit-to-a-work-branch.md),
[0022](adr/0022-owner-agent-registry.md).

What it needs:

- An AI model set up under AI & Models. Without one, a plan fails at once with the reason "no AI model is set up".
- `CRON_SECRET` (already used by the other cron routes).
- A repository connected to the project, for agents to write code.
- For a preview of the work branch: the repository connected to Vercel, and repository events switched on in the Git tab.

### Run the queue every minute

`vercel.json` calls the route once a day, which is all Vercel's Hobby plan allows. In production call it
every minute: on Vercel Pro change the schedule to `* * * * *`, or call it from an outside scheduler:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://www.saqina.dev/api/cron/executions
```

Expect `{"handled":N}`. `401` means the secret is wrong; `503` means `CRON_SECRET` is not set.
Until it runs every minute, a job the first worker missed waits for the next call, or for someone to open the execution (an open stream starts a drain).

### An execution looks stuck

Find the open ones and their tasks:

```sql
select left(id::text, 8) as id, status, mode, error_summary, now() - created_at as age
from executions where status not in ('succeeded', 'failed', 'cancelled') order by created_at;
```

```sql
select t.title, t.execution_status, t.blocked_reason
from tasks t where t.execution_id = (select id from executions where id::text like '<id>%') order by t.position;
```

Then look at its jobs:

```sql
select kind, status, attempts, run_after, locked_until, last_error
from execution_jobs where execution_id = (select id from executions where id::text like '<id>%') order by created_at;
```

- `pending` with `run_after` in the past: nothing is working the queue. Call the cron route above.
- `running` with `locked_until` in the past: a worker died. The next drain takes it over and counts that try as failed.
- `failed` with `attempts` 4: the job ran out of tries; read `last_error`. The task is shown as failed in the Studio, where **Try again** continues it.

To stop a runaway execution, press **Stop** in the Studio. Only if the Studio cannot be reached, as a last resort:

```sql
update executions set cancel_requested_at = now() where id::text like '<id>%' and status in ('running', 'planning');
```

The next dispatch round cancels the tasks nobody is running and ends the execution once the running ones return.

### A build or check failed after the agents finished

Vercel's preview build or a CI run on an execution's work branch failed. The same agents get one more go
(at most two rounds, one at a time), on the same branch, told what failed ([ADR 0026](adr/0026-repair-failed-builds.md)).
The Activity list says "The agents are fixing it" or "No automatic fix: <reason>".

- *"it was tried twice already"*: change the plan or fix it by hand on the branch, or start a new Build.
- *"no automatic fix" for a person who left*: start a Build from someone who has access.
- The request says "No log is available": the project has no Vercel target or the log call failed; check the connection under Publish.

### Common reasons an execution fails

| Reason shown | Cause | Fix |
|---|---|---|
| No AI model is set up | `ai_providers` or the default model is empty | Add a provider and model under AI & Models |
| No agent is on for a role | An agent definition is switched off or archived | Switch it on under AI & Models, Agents, then try again |
| No repository is connected | The project has no repository connection | Connect one in the Git tab |
| The repository refused the operation | Token expired, branch locked, host down | Check the connection (Git tab), then try again |
| A change was refused before it was written (`write_refused`) | The task wrote a file outside its scope, more than 12 files, a real `.env`, a secret or an invalid `package.json`; the reason names the file | Try again (the agent sees the reason); if the plan gave the task too few paths, change the plan |
| The agent did not answer / the model did not answer (`model_failed`) | The model returned nothing usable (not JSON, too long) or timed out; a local CLI is slower and runs a few at once | Try again; check AI & Models, or use an API provider for builds |
| The worker stopped before the task finished | A function was cut at its time limit | Nothing; the task was retried. If it repeats, shorten the agent's time limit or the task |

### Locally and in tests

The dev AI mock answers the planner and the agents deterministically (`DEV_AI_DELAY_MS` slows it down, `DEV_AI_SERVER_PORT` moves it):

```bash
pnpm tsx scripts/dev-ai-server.ts
```

The end-to-end test needs its own database, whose name contains `_e2e` (it is emptied):

```bash
DATABASE_URL_E2E=postgres://user@localhost:5432/saqinadev_e2e pnpm e2e
```

### Roll back

Migrations `0036_executions` and `0037_task_revisions` only add tables and columns, so redeploying the
previous version works without touching the database. Old executions stay in the tables.

## Local CLI as an AI provider (Claude Code, Codex, OpenCode, Kiro CLI)

An alternative to an API key, for a self-hosted server or a development machine. Decision:
[ADR 0023](adr/0023-local-cli-provider.md). It does not work on Vercel (no CLI is installed there).

1. Install the CLI on the machine that runs Saqina and log it in **as the user that runs Saqina**:
   `claude auth login`, `codex login`, `opencode auth login` or `kiro-cli login`.
2. As a platform Owner open **AI & Models > Providers > Local CLI** and turn the **Local CLIs** switch
   on. It is off by default; while it is off nothing is detected or started. Turning it off again stops
   every CLI provider at its next call, without deleting it.
3. Turning the switch on shows a warning: a CLI signed in with a ChatGPT or Claude subscription can break
   the provider's terms and get the account banned. Accept it, or leave it off. It is refused on a hosted
   platform. Then press **Connect and test** on a CLI.
   The CLI becomes a provider with its models; set it as the default or map it to an agent role as usual.
4. To stop using it: **Disconnect** or **Disable** the provider. Every change is in the audit log.

If a test fails: confirm the CLI answers in a terminal as the server's user (`claude -p "hi"`), that
its login has not expired, and that the server user's home is readable. Saqina passes the CLI only the
home, search path and proxy settings, so a login kept in a different variable must be set up as a
file-based login. A run is stopped after 3 minutes.

## VPS (Instabox)

Saqina runs on one VPS with Docker Compose ([ADR 0028](adr/0028-host-on-a-vps-with-docker.md)): `web`,
`scheduler` (calls the cron routes; executions every minute) and `caddy`. The `postgres` service is off
(profile `localdb`) while the database stays on Neon. The VPS has 4 vCPU, 8 GB RAM and 20 GB disk; the disk
is the limit, so logs rotate (10 MB × 3 per service) and a deploy keeps only two image tags.

### First-time setup

On GitHub (repository settings):

- Variables: `NEXT_PUBLIC_SITE_URL` (for example `https://saqina.dev`) and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
  They are fixed into the image at build time.
- Secret `BUILD_DATABASE_URL`: a read-only role on the production database. The build prerenders the
  public `/services` pages from it, as Vercel's build does.
- Push to `main` (or run the Image workflow by hand): `image.yml` publishes
  `ghcr.io/raydiansyah/saqinadev:<commit>` and `:main`.

In Cloudflare: the DNS record for the domain is proxied (orange cloud), SSL/TLS mode is **Full (strict)**,
an **Origin Certificate** (SSL/TLS > Origin Server, 15 years) is created for the domain, and
**Authenticated Origin Pulls** is on (same page). Keep the certificate and its key for the step below;
Cloudflare shows the key once. With origin pulls, Caddy accepts a connection only when it carries
Cloudflare's client certificate, so nobody can reach the server around Cloudflare. The firewall cannot do
this alone: ports Docker publishes skip ufw's rules.

On the VPS, as root:

```bash
adduser --disabled-password --gecos "" saqina && usermod -aG sudo saqina
```

```bash
curl -fsSL https://get.docker.com | sh && usermod -aG docker saqina
```

```bash
curl -fsSL https://tailscale.com/install.sh | sh && tailscale up --ssh
```

After `tailscale up`, check that `ssh saqina@<tailscale name>` works from the laptop. Then close SSH on
the public address:

```bash
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl reload ssh
```

Copy `deploy/` to `/opt/saqina` (owned by `saqina`), then in `/opt/saqina`:

```bash
./cloudflare-ips.sh
```

It writes `cloudflare-ips.caddy`: the Cloudflare ranges Caddy takes the visitor's address from. Then keep
SSH on Tailscale only (80 and 443 are guarded by origin pulls, above):

```bash
ufw allow in on tailscale0 && ufw default deny incoming && ufw enable
```

Put the origin certificate in `/opt/saqina/certs/origin.pem` and its key in `origin-key.pem` (mode 600),
and Cloudflare's origin-pull CA next to them:

```bash
curl -fsS -o /opt/saqina/certs/cloudflare-origin-pull-ca.pem https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem
```

This is Cloudflare's shared certificate, so any Cloudflare zone could still send traffic to the server;
a per-hostname certificate (uploaded in the same Cloudflare page) closes that too.
Create `/opt/saqina/.env` from `env.example` (mode 600) with the production values, `SAQINA_DOMAIN`, and
`DATABASE_URL` set to Neon's pooled connection string. Let the VPS pull the private image:

```bash
docker login ghcr.io -u <github user>
```

Use a token with only `read:packages`. Then deploy (below).

### Check

```bash
curl -s https://<domain>/api/health
```

Expected: `"status":"ok"` and the deployed commit. Within a minute the scheduler logs a call:

```bash
docker compose logs --since 2m scheduler
```

Expected: `{"job":"executions","status":200,…}` lines. Caddy replaces `X-Forwarded-For` and `X-Real-IP`
with the address it checked, so what Caddy logs as `client_ip` is what the app reads. A forged one must
not get through:

```bash
curl -s -H "X-Forwarded-For: 1.2.3.4" https://<domain>/api/health && docker compose logs --since 1m caddy | grep -o '"client_ip":"[^"]*"' | tail -1
```

Expected: the laptop's public address, not `1.2.3.4`. The server must refuse anyone but Cloudflare:

```bash
curl -sk --resolve <domain>:443:<VPS public IP> https://<domain>/api/health
```

Expected: a TLS error, no JSON.

### Backups

`backup.sh` dumps the database (`BACKUP_DATABASE_URL`, Neon's **direct** URL while the database is there)
with a Postgres 17 client container and uploads it to R2 as `saqina-<date>.dump`. The dump passes through
a temporary file that is always removed. In Cloudflare R2: create a bucket, an API token with Object
Read & Write on that bucket only, and a lifecycle rule that deletes objects after 14 days. Put the
endpoint (`https://<account>.r2.cloudflarestorage.com`), bucket, key and secret in `.env` as `BACKUP_R2_*`.

Install the daily timer (18:00 UTC, 01:00 WIB) once:

```bash
cp /opt/saqina/saqina-backup.service /opt/saqina/saqina-backup.timer /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now saqina-backup.timer
```

```bash
systemctl list-timers saqina-backup.timer
```

Expected: the next run at 18:00 UTC. After the first run, the drill restores the latest backup into a
throwaway database and compares every table's row count with the live one:

```bash
cd /opt/saqina && ./restore.sh "$(date -u +%F)"
```

Expected: `vector`, then "Drill passed". Rows written since the backup show as a small difference; run it
right after a backup. Record each drill here:

| Date | Backup | Result |
|---|---|---|

A real restore goes into an empty database and asks first:

```bash
cd /opt/saqina && ./restore.sh <YYYY-MM-DD> --into <database url>
```

## Deploy

On the VPS:

1. Merge into `main`. The Image workflow publishes `ghcr.io/raydiansyah/saqinadev:<commit>`; wait for it.
2. If the change has a migration, take a backup first:

```bash
cd /opt/saqina && ./backup.sh
```

3. Deploy the commit:

```bash
cd /opt/saqina && ./deploy.sh <full commit id>
```

The script refuses with less than 3 GB free, pulls the image, applies migrations (with
`MIGRATE_DATABASE_URL` from `.env` when set, which must be Neon's **direct** URL; otherwise `DATABASE_URL`),
starts it, and waits up to 90 s for `/api/health` to report that commit. If the new web never turns
healthy, or reports another commit, it starts the previous tag again, waits for that to be healthy, and
exits 1. On success it writes the tag into `.env` (`SAQINA_TAG`, so a hand-run `docker compose` command
uses what is running) and keeps only this tag and the previous one. A Neon pooled URL (`-pooler`) is
refused for migrations.

4. Run the smoke test against the domain (Actions > Post-deploy smoke test > Run workflow, with the URL).

### Before the move (Vercel)

While production was on Vercel, a migration was applied before promoting:

```bash
neonctl auth
```

```bash
pnpm db:migrate:neon --backup
```

The script asks for `yes`. It needs `NEON_PROJECT_ID` and `NEON_DATABASE` in `.env.neon`
(git-ignored); a snapshot branch `pre-migrate-…` is created first.

3. Check `/api/health` and run the smoke test.

Migration 0039 runs `CREATE EXTENSION IF NOT EXISTS vector`. On Neon the project owner role may
create it. After the migration, check:

```sql
select * from pg_extension where extname = 'vector';
```

Expected: one row. No row means the migration failed or ran on another database: do not promote.

## Semantic search

What it is and why: [ADR 0024](adr/0024-semantic-search.md). Project text goes to the platform's embedding
provider only for a project whose admin turned the switch on.

**Switch the platform model off.** Sign in as platform owner, open AI & Models, set Embedding model to
None, and press Save embedding model. Opted-in projects keep their switch but answer by words and exact
matches (`semantic` is `off`), and no embedding call is made. Saving queues a reconcile for every
opted-in project, and that run deletes the project's vectors because no model can read them; the daily
cron does the same for any project it missed.

**Switch a project off.** An admin opens the project's Memory page and presses Turn off semantic search.
That deletes the project's vectors in the same transaction. There is no other bulk delete: to clear a
project by hand, switch it off.

**Daily cron.** `GET /api/cron/maintenance` (Bearer `CRON_SECRET`, like the other cron routes) deletes the vectors of every project that is not opted in
and queues a reconcile (`embed_project`) for every project that is. It is the safety net for a missed
trigger. Its JSON result has `embedSwept` (vectors deleted) and `embedRequeued` (projects queued).

**A project stays at "indexing".** Open the project's Memory page, then Processing. Jobs of kind "Index
for semantic search" show the attempts and the state ("Will retry" or "Failed"); retry one there. A
failing provider (wrong key, quota, model removed) is the usual cause. Check AI & Models first, then the
rows of the `ai_usage_records` table with operation `embedding` for the error code. A model change makes every opted-in project
re-embed, so "indexing" for a while after one is expected.

**Rollback by redeploy.** A build from before semantic search marks queued `embed_project` jobs `ready`
without doing anything. That is harmless: the next trigger or the daily cron after the fix is live
queues a new reconcile.

## Roll back the application

On the VPS:

```bash
cd /opt/saqina && ./deploy.sh "$(cat PREVIOUS)"
```

Then check `/api/health`. Because migrations only add, the previous image runs against the new schema.
On Vercel (before the move): `vercel rollback`, or promote the previous deployment in the dashboard.

## Roll back the database

Only on the owner's decision. Restore points: the nightly backups in R2 (`restore.sh`, see Backups) and,
while the database is on Neon, its own restore and the `pre-migrate-…` branches. Restoring loses
writes made after it was taken, so prefer fixing forward with a new migration.

## Incident response

1. **Detect**: alert, user report, or health check. Note the time.
2. **Contain**: roll back the application; switch off the feature (registration off in Settings, provider
   disabled in AI & Models) if that stops the harm.
3. **Assess**: what data or users are affected; is personal data involved. Personal-data breach: follow the
   legal notification window with the owner and the company's lawyer.
4. **Fix** with a pull request (a hotfix is still a pull request with a test).
5. **Review**: write the post-incident review within five working days (`docs/incidents/TEMPLATE.md`).

## Rotate a secret

1. Create the new value at the provider (database, email, AI key, OAuth client secret, Turnstile).
2. Set it in the hosting environment; redeploy.
3. Revoke the old one at the provider. Provider keys stored in the app: replace them in AI & Models
   (the old ciphertext is revoked automatically).
4. If a secret was ever committed or logged, treat it as leaked: rotate first, clean history second.

## Restore a document or memory

Documents keep every version (`document_versions`); restore by saving the old content as a new version.

## Cloudflare (free) caching for public pages

This holds the public marketing and legal pages at Cloudflare's edge so most public requests never
reach Vercel, cutting Fast Origin Transfer and Fluid Active CPU. The app sends
`public, s-maxage=3600, stale-while-revalidate=86400` on those paths (see `next.config.ts`), and
the service catalog is ISR (`revalidate = 3600`). Private routes stay dynamic and uncached.

### 0. The record must be proxied (orange cloud)

Cloudflare only caches when it sits in the request path. A DNS-only record (grey cloud) resolves the
name and steps aside, so no Cache Rule ever runs and `cf-cache-status` never appears.

1. In the zone's DNS tab, switch the apex record that points to Vercel to **Proxied** (orange cloud).
   A `CNAME` to a Vercel target is fine; Cloudflare flattens the apex CNAME automatically.
2. SSL/TLS > Overview: set the mode to **Full (strict)**. Vercel serves a valid certificate, so this
   avoids a redirect loop once traffic is proxied.
3. Keep `*.saqina.dev` (published client projects) **DNS-only / grey** unless you have a plan to
   cache them too — those are separate apps with their own needs.
4. After switching, confirm the site still loads and `/api/health` still returns `"database":true`.

### 1. Cache Rule: public pages are cacheable

Caching > Cache Rules > Create rule.

- Name: `Public pages — cacheable`
- When incoming requests match (expression editor). The regex `matches` operator needs a Business
  plan, so the free plan uses `eq` and `starts_with`:

  ```
  (http.request.uri.path eq "/en") or (http.request.uri.path eq "/id") or (starts_with(http.request.uri.path, "/en/services")) or (starts_with(http.request.uri.path, "/id/services")) or (starts_with(http.request.uri.path, "/en/themes")) or (starts_with(http.request.uri.path, "/id/themes")) or (starts_with(http.request.uri.path, "/en/privacy")) or (starts_with(http.request.uri.path, "/id/privacy")) or (starts_with(http.request.uri.path, "/en/terms")) or (starts_with(http.request.uri.path, "/id/terms"))
  ```

  `starts_with(path, "/en/services")` covers both `/en/services` and `/en/services/<slug>`, so one
  clause handles the list page and every detail page. None of these prefixes can match `dashboard`,
  `project`, `portal`, `sign-in`, `invite` or `/api`. Because `starts_with` is looser than an
  anchored regex, the "Private — never cache" rule (next section) MUST sit above this one.
- Then:
  - Cache eligibility = **Eligible for cache**.
  - Edge TTL = **Use cache-control header if present, bypass cache if not**. The app sends
    `s-maxage=3600`, so Cloudflare honors it; a response with no cache header is not meant to be
    cached and is bypassed. Do not pick "Ignore cache-control header and use this TTL" (that moves
    the TTL out of the code) or the "default TTL" option (that caches header-less responses on a
    guess).
  - Browser TTL = **Respect origin** (use the cache-control header if present).
- The app owns the TTL (`s-maxage=3600`), so there is one source of truth — change it in
  `next.config.ts`, not here.
- Deploy.

### 2. Cache Rule: private routes never cache

Create a second rule and order it **above** the public one (rules run top to bottom).

- Name: `Private — never cache`
- Expression:

  ```
  (http.request.uri.path contains "/dashboard") or (http.request.uri.path contains "/project") or (http.request.uri.path contains "/portal") or (starts_with(http.request.uri.path, "/api")) or (http.request.uri.path contains "/sign-in") or (http.request.uri.path contains "/sign-up") or (http.request.uri.path contains "/invite")
  ```

- Then: Cache eligibility = **Bypass cache**. Deploy.

### 3. No Set-Cookie on public pages (already handled in code)

A shared cache bypasses any response that carries `Set-Cookie`. `src/i18n/routing.ts` sets
`localeCookie: false`, so next-intl never writes `NEXT_LOCALE` (the locale is always in the URL).
Auth cookies only appear on private routes. Keep it this way: do not add a cookie to a public page.

### 4. Verify

`www.saqina.dev` redirects to the apex `saqina.dev`, so verify against the apex. First confirm
Cloudflare is actually in the path — a `cf-ray` header must be present and `server` must say
`cloudflare`. If instead you see `server: Vercel` and no `cf-ray`, the record is still grey (DNS
only) and no cache rule runs; fix step 0 first.

```bash
curl -sI https://saqina.dev/en/services | grep -i 'server:\|cf-ray'
```

Then a public page misses on the first request and hits on the second:

```bash
curl -sI https://saqina.dev/en/services | grep -i 'cf-cache-status\|cache-control'
curl -sI https://saqina.dev/en/services | grep -i 'cf-cache-status'
```

The second must show `cf-cache-status: HIT`. A private page must never hit:

```bash
curl -sI https://saqina.dev/en/dashboard | grep -i 'cf-cache-status'
```

Expect `DYNAMIC` or `BYPASS`, never `HIT`. If a public page still bypasses on the second request:

- No `cf-ray` / `server: Vercel` — the apex record is grey; make it orange (step 0). This is the
  most common cause.
- `curl -sI https://saqina.dev/en/services | grep -i set-cookie` — if a cookie is present, that is
  the cause.
- Confirm `Cache-Control` shows `s-maxage=3600`; if absent, the `next.config.ts` header is not
  deployed yet.

Then watch the Fast Origin Transfer and Fluid Active CPU graphs in Vercel over a few days.
