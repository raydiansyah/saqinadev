# Installation

How to run Saqina Dev on your machine and how to deploy it.

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 24 LTS | Runtime |
| pnpm | 10 | Package manager |
| PostgreSQL | 14+ | Application database, plus a second database named `..._test` for tests |

## 2. Configure

```bash
cp .env.example .env.local
```

Required: `DATABASE_URL` (a local database, never production), `BETTER_AUTH_SECRET` (`openssl rand -base64 32`),
`BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL` (for example `http://localhost:3000`). Optional:

| Variable | What it switches on |
|---|---|
| `RESEND_API_KEY` and `EMAIL_FROM` | Real email. Without both, mail is printed to the server console |
| `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` | "Continue with Google" |
| `CRON_SECRET` | The cron routes; without it they refuse every call |
| `PLATFORM_OWNER_EMAILS` or `OWNER_EMAIL` | Who can open and close white label |
| `WHATSAPP_PROVIDER` | Which WhatsApp sender delivers reminders (only `console` exists) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` | Captcha on public forms (production only) |

## 3. Database and first run

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

The seed creates a demo owner (`demo@saqina.test`) and a demo client (`client@saqina.test`) with one project,
two invoices, a receipt, a shared proposal and a maintenance plan. They are for local use only.

## 4. Check

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## 5. Deploy

The app is served by Vercel with a Neon database. Steps, scheduled jobs, rollback and incident handling are
in the [runbook](runbook.md). Apply migrations before promoting a deployment, and set `CRON_SECRET` so
`/api/cron/reminders` and `/api/cron/maintenance` can run.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Invoice or receipt mail never arrives | `RESEND_API_KEY` or `EMAIL_FROM` is missing; check the server console |
| A PDF download answers 404 | The record is not visible to the signed-in person (a draft invoice, a voided receipt, another organization's file) |
| The brand does not show on the portal | White label is closed for the organization, or the client has accounts in two organizations |
| WhatsApp reminders show `skipped` | No provider is connected, or the client has no valid phone number |
