# Installation guide

How to run Saqina Dev on your machine, how to deploy it, and how to switch on the agent Studio
(Plan and Build). The runbook ([runbook.md](runbook.md)) covers operating a running install.

## 1. Requirements

| Need | Version | Notes |
|---|---|---|
| Node.js | 24 LTS | |
| pnpm | 10 | `corepack enable` |
| PostgreSQL | 14+ | A local database for development. Never point `.env.local` at production. |
| Git | any recent | Needed by the local-git test adapter and by agents. |

Three databases keep work apart. Create them once:

```bash
createdb saqinadev_dev
createdb saqinadev_test
createdb saqinadev_e2e
```

Tests refuse a database whose name lacks `_test`, and the end-to-end seed refuses one without `_e2e`,
because both empty the database.

## 2. Install

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local`. Every variable is explained in [`.env.example`](../.env.example).

### Required

| Variable | How to get it |
|---|---|
| `DATABASE_URL` | Your local development database. |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `SAQINA_ENCRYPTION_KEY` | `openssl rand -base64 32`. Losing it makes stored provider keys and Git tokens unreadable. |
| `NEXT_PUBLIC_SITE_URL`, `BETTER_AUTH_URL` | `http://localhost:3000` locally. |

### For the agent Studio (Plan and Build)

| Variable | Purpose |
|---|---|
| `CRON_SECRET` | Authorises `/api/cron/executions` (and the other cron routes). Without it they refuse every call. `openssl rand -base64 32` |
| `ANTHROPIC_API_KEY` or a provider under *Dashboard → AI & Models* | A model is required. Without one a plan fails at once with "no AI model is set up". |
| `PLATFORM_OWNER_EMAILS` or `OWNER_EMAIL` | Only the platform Owner manages the agent registry. |
| `DATABASE_URL_TEST`, `DATABASE_URL_E2E` | Only for `pnpm test` and `pnpm e2e`. |

### Optional

Google and GitHub sign-in, Resend email, S3 attachments, Turnstile captcha and Vercel publishing are
optional. Each block in `.env.example` says what happens without it.

## 3. Prepare the database and the Owner

```bash
pnpm db:migrate
```

```bash
pnpm db:create-owner
```

The second command creates the Owner account (idempotent). Set `OWNER_EMAIL` first; leave
`OWNER_PASSWORD` empty to have a strong one printed once.

## 4. Run

```bash
pnpm dev
```

Open <http://localhost:3000> and sign in as the Owner.

## 5. Try Plan and Build without a real model key

For development only, a deterministic mock model stands in for a provider.

1. Set `ALLOW_LOCAL_ENDPOINTS=1` and `ALLOW_LOCAL_GIT=1` in `.env.local`.
2. Start the mock:

```bash
pnpm tsx scripts/dev-ai-server.ts
```

3. In *Dashboard → AI & Models* add a custom OpenAI-compatible provider with base URL
   `http://localhost:4100/v1` and key `dev-mock-key-0000`, then map the agent roles to its model
   `saqina-dev-mock`.
4. Create a project, connect a local repository path as its Git connection, open the Studio, choose
   **Build** in the composer and send an instruction.
5. While the build runs, call the queue by hand if you do not want to wait for the cron:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/executions
```

Agents commit to `saqina/exec-<id>` only. They never touch the main branch, merge or deploy.

## 6. Set up the agents (Owner)

1. Open *Dashboard → AI & Models → Agents* (`/dashboard/ai/agents`). The 8 presets appear on first view.
2. Edit instructions, scope, tools, model, retries and timeout as needed; every change makes a new
   version and an audit entry.
3. Set an agent inactive to stop new tasks going to it.

## 7. Verify the install

```bash
pnpm lint && pnpm typecheck
```

```bash
DATABASE_URL_TEST=postgres://user@localhost:5432/saqinadev_test pnpm test
```

```bash
DATABASE_URL_E2E=postgres://user@localhost:5432/saqinadev_e2e pnpm e2e
```

`pnpm build` also needs `DATABASE_URL` set. `pnpm e2e` starts its own app on port 3100 and the mock
model on 4101, and uses the Chromium that Playwright installed.

## 8. Deploy (Vercel)

1. Create the project, connect the repository, and set the variables from `.env.example` in the
   hosting dashboard. Do not add `OWNER_PASSWORD` there.
2. Run `pnpm db:migrate:neon` (or `pnpm db:migrate` against your own database) before the first deploy.
3. Set `CRON_SECRET`. Vercel Cron sends it as a Bearer token.
4. **Run `/api/cron/executions` every minute.** `vercel.json` schedules it daily because Hobby allows
   no more. On Vercel Pro change the schedule to `* * * * *`, or call it from an external scheduler
   (command in [runbook.md](runbook.md#executions-plan-and-build-with-agents)).
5. For previews of the agent work branch, connect the project's repository to Vercel and switch on
   repository events in the Studio's Git tab.
6. For publishing client sites, set `VERCEL_TOKEN`, `VERCEL_TEAM_ID` and `SAQINA_PROJECTS_DOMAIN`
   (see the runbook's publishing section).

## 9. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `DATABASE_URL is not set` during `pnpm build` or tests | Export it: build uses `DATABASE_URL`, tests use `DATABASE_URL_TEST`. |
| Build starts but a plan fails at once | No AI model is set up. Add a provider under AI & Models. |
| Build never advances | The queue is not being called. Check `CRON_SECRET` and the cron schedule. |
| 403 on the agents page | The signed-in user is not the platform Owner. |
| Preview stays empty | Repository not connected to Vercel, or repository events are off. |
