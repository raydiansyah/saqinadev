# Runbook

Commands run from the repository root. One command per block.

## Contacts

Owner, on-call and escalation: see [governance](standards/governance.md). Fill them in before launch.

## Health

```bash
curl -s https://www.saqina.dev/api/health
```

Expect `{"status":"ok","database":true,...}`. `commit` is the deployed commit.

```bash
pnpm smoke https://www.saqina.dev
```

## VPS (Instabox)

Saqina runs on one VPS with Docker Compose ([ADR 0028](adr/0028-host-on-a-vps-with-docker.md)): `web`,
`scheduler` (calls the cron routes: reminders and maintenance) and `caddy`. The `postgres` service is off
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
(git-ignored); a snapshot branch `pre-migrate-...` is created first.

3. Check `/api/health` and run the smoke test.

## Scheduled jobs

Two Vercel cron jobs in `vercel.json`, both guarded by `CRON_SECRET` (sent as a Bearer token; without it
the routes refuse every call):

- `/api/cron/reminders` at 01:00 UTC: sends each organization's due reminders. Safe to run again: the
  reminder log makes a repeat send nothing.
- `/api/cron/maintenance` at 01:30 UTC: deletes expired sessions and verification rows, old rate-limit
  counters, read notifications after 90 days and audit events after 24 months.

Run one by hand:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://www.saqina.dev/api/cron/reminders
```

The answer is `{"organizations":N,"sent":N,"skipped":N}`. An owner or admin can also press "Run now" on
the Reminders page; that runs the same job for one organization.

## WhatsApp reminders

A reminder rule can also send its client reminder to the client's phone number. No provider is connected:
`WHATSAPP_PROVIDER=console` prints the message (number masked) outside production and, in production,
sends nothing and records the delivery as `skipped`. To see what happened:

```sql
select channel, status, error, count(*) from notification_deliveries
where channel = 'whatsapp' group by 1, 2, 3;
```

`error = no_phone` means the client has no usable number (the field accepts `0812...`, `+62 812...`, `62812...`).
To connect a provider, add a sender in `src/lib/notifications/channels/whatsapp.ts`, register its name in
`getWhatsappSender`, set `WHATSAPP_PROVIDER`, and send one reminder to a test number before turning rules on.
Meta's Cloud API needs a verified business number and approved message templates for business-started
messages.

## White label

Only the platform owner opens or closes it, on Settings > White label, after a paid plan or a signed
agreement. Enter the plan code or the agreement reference. Closing it hides the brand and the logo at once
and deletes nothing. The organization's owner or admin sets the brand once it is open.

## Tables of removed features

v1 removed the AI, Studio, agents, memory and planning features and their tables
([ADR 0030](adr/0030-v1-billing-focus.md)). Migration `0045_drop_removed_features.sql` drops them, along
with the document sync trigger that would otherwise break every document write. The owner decided the
data of those features does not need to be kept or migrated. Apply `0045` to production like any other
migration, after `0042` to `0044`:

```bash
pnpm db:migrate:neon --backup
```

The `--backup` snapshot branch still makes a restore point. Nothing in the application reads those tables.

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
2. **Contain**: roll back the application; switch off the feature (registration off in Settings, white
   label revoked for one organization) if that stops the harm.
3. **Assess**: what data or users are affected; is personal data involved. Personal-data breach: follow the
   legal notification window with the owner and the company's lawyer.
4. **Fix** with a pull request (a hotfix is still a pull request with a test).
5. **Review**: write the post-incident review within five working days (`docs/incidents/TEMPLATE.md`).

## Rotate a secret

1. Create the new value at the provider (database, email, OAuth client secret, Turnstile, the cron secret).
2. Set it in the hosting environment; redeploy.
3. Revoke the old one at the provider.
4. If a secret was ever committed or logged, treat it as leaked: rotate first, clean history second.

## Restore a document

Documents keep every version (`document_versions`); restore by saving the old content as a new version.
A signed document is locked: create a new one instead. A voided payment and its receipt stay visible; a
wrong receipt is corrected by voiding the payment and recording it again.

## Cloudflare (free) caching for public pages

This holds the public landing and legal pages at Cloudflare's edge so most public requests never
reach Vercel, cutting Fast Origin Transfer and Fluid Active CPU. The app sends
`public, s-maxage=3600, stale-while-revalidate=86400` on those paths (see `next.config.ts`), and
Private routes stay dynamic and uncached.

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

- Name: `Public pages: cacheable`
- When incoming requests match (expression editor). The regex `matches` operator needs a Business
  plan, so the free plan uses `eq` and `starts_with`:

  ```
  (http.request.uri.path eq "/en") or (http.request.uri.path eq "/id") or (starts_with(http.request.uri.path, "/en/privacy")) or (starts_with(http.request.uri.path, "/id/privacy")) or (starts_with(http.request.uri.path, "/en/terms")) or (starts_with(http.request.uri.path, "/id/terms"))
  ```

  None of these prefixes can match `dashboard`,
  `project`, `portal`, `sign-in`, `invite` or `/api`. Because `starts_with` is looser than an
  anchored regex, the "Private: never cache" rule (next section) MUST sit above this one.
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

- Name: `Private: never cache`
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
curl -sI https://saqina.dev/en/privacy | grep -i 'server:\|cf-ray'
```

Then a public page misses on the first request and hits on the second:

```bash
curl -sI https://saqina.dev/en/privacy | grep -i 'cf-cache-status\|cache-control'
curl -sI https://saqina.dev/en/privacy | grep -i 'cf-cache-status'
```

The second must show `cf-cache-status: HIT`. A private page must never hit:

```bash
curl -sI https://saqina.dev/en/dashboard | grep -i 'cf-cache-status'
```

Expect `DYNAMIC` or `BYPASS`, never `HIT`. If a public page still bypasses on the second request:

- No `cf-ray` / `server: Vercel` — the apex record is grey; make it orange (step 0). This is the
  most common cause.
- `curl -sI https://saqina.dev/en/privacy | grep -i set-cookie` — if a cookie is present, that is
  the cause.
- Confirm `Cache-Control` shows `s-maxage=3600`; if absent, the `next.config.ts` header is not
  deployed yet.

Then watch the Fast Origin Transfer and Fluid Active CPU graphs in Vercel over a few days.
