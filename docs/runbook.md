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

1. Create a private bucket (block all public access). Any S3-compatible store works (Cloudflare R2,
   MinIO); set `S3_ENDPOINT` for those.
2. Create an access key whose policy allows only `s3:PutObject`, `s3:GetObject` and
   `s3:DeleteObject` on `arn:aws:s3:::<bucket>/projects/*`.
3. Set `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (and `S3_ENDPOINT` if
   needed) in Vercel for Production and Preview, then redeploy.
4. Check `/api/health` shows `"fileStorage":true`, then attach a small image in a project's chat.

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

### Common reasons an execution fails

| Reason shown | Cause | Fix |
|---|---|---|
| No AI model is set up | `ai_providers` or the default model is empty | Add a provider and model under AI & Models |
| No agent is on for a role | An agent definition is switched off or archived | Switch it on under AI & Models, Agents, then try again |
| No repository is connected | The project has no repository connection | Connect one in the Git tab |
| The repository refused the operation | Token expired, branch locked, host down | Check the connection (Git tab), then try again |
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

## Local CLI as an AI provider (Claude Code, Codex, OpenCode)

An alternative to an API key, for a self-hosted server or a development machine. Decision:
[ADR 0023](adr/0023-local-cli-provider.md). It does not work on Vercel (no CLI is installed there).

1. Install the CLI on the machine that runs Saqina and log it in **as the user that runs Saqina**:
   `claude auth login`, `codex login` or `opencode auth login`.
2. Set `ALLOW_LOCAL_CLI=1` in that server's environment and restart. Without it the section says it
   is off and nothing is started.
3. As a platform Owner open **AI & Models > Providers > Local CLI** and press **Connect and test**.
   The CLI becomes a provider with its models; set it as the default or map it to an agent role as usual.
4. To stop using it: **Disconnect** or **Disable** the provider. Every change is in the audit log.

If a test fails: confirm the CLI answers in a terminal as the server's user (`claude -p "hi"`), that
its login has not expired, and that the server user's home is readable. Saqina passes the CLI only the
home, search path and proxy settings, so a login kept in a different variable must be set up as a
file-based login. A run is stopped after 3 minutes.

## Deploy

1. Merge the pull request into `main` (no direct pushes).
2. If it contains a migration, apply it **before** promoting (the previous deployment must keep working,
   so migrations only add):

```bash
neonctl auth
```

```bash
pnpm db:migrate:neon --backup
```

The script asks for `yes`. It needs `NEON_PROJECT_ID` and `NEON_DATABASE` in `.env.neon`
(git-ignored); a snapshot branch `pre-migrate-…` is created first.

3. Check `/api/health` and run the smoke test.

## Roll back the application

```bash
vercel rollback
```

or promote the previous deployment in the Vercel dashboard. Then check `/api/health`. Because migrations
only add, the previous build runs against the new schema. Rehearse this on a preview before first needing it.

## Roll back the database

Only on the owner's decision. The `pre-migrate-…` Neon branch is the restore point. Restoring loses
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
