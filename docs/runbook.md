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
