# Delivery: CI/CD, environments, rollback, dependencies

## Pipeline (`.github/workflows/ci.yml`; Enforced once branch protection requires it)

```
install (frozen lockfile) → lint → typecheck → test + coverage → build → security scan → (preview deploy → smoke)
```

| Step | Command | Fails when |
|---|---|---|
| Lint | `pnpm lint` | Biome errors (formatting, imports, correctness) |
| Types | `pnpm typecheck` | any TypeScript error |
| Tests | `pnpm test:coverage` | a test fails (needs `@vitest/coverage-v8`; without it CI runs tests only and warns) |
| Coverage of changed code | `pnpm check:coverage` | a new or changed file under `src/lib`, `src/app/api` or an `actions.ts` has < 85% of lines (pull requests only) |
| Build | `pnpm build` | the production build fails |
| Static analysis | Semgrep OSS rulesets (default, TypeScript, React) | any finding in `src` (fix it, or suppress with a reviewed `nosemgrep` comment and a reason) |
| Dependencies | `pnpm audit --prod` + licence check | a high/critical advisory or a disallowed licence |
| Secrets | gitleaks | a secret-like string in the diff or history (an organisation repository needs a free `GITLEAKS_LICENSE`) |

## Environments

- **Local**: `pnpm dev` against a local PostgreSQL (`saqinadev_dev`), tests against `saqinadev_test`.
- **Preview (staging)**: every pull request gets a Vercel preview, ideally with its own Neon branch.
  It is separate from production and is where smoke tests and Lighthouse run.
- **Production**: deploys only from `main`, only by merged pull request (**no direct push**: enable
  branch protection requiring a pull request and a green pipeline). Production secrets exist only in
  the hosting settings.

## Release procedure

1. Merge the pull request.
2. If it has a migration: `pnpm db:migrate:neon --backup`, in a terminal, before promoting. Migrations
   are **expand then contract**: add columns/tables first, remove old ones in a later release, so the
   previous deployment keeps working against the new schema (this is what makes rollback safe).
3. Promote the deployment. `.github/workflows/post-deploy.yml` runs `pnpm smoke` against production
   automatically when Vercel reports success; a red run means roll back. Also check `/api/health`.

## Rollback (one command, tested)

- Application: `vercel rollback` (or promote the previous deployment in the dashboard). The previous
  build works with the new schema because of expand-then-contract.
- Database: the pre-migration snapshot branch (`pnpm db:migrate:neon --backup`) is the restore point;
  restoring is a decision for the owner, see the [runbook](../runbook.md).
- A rollback is rehearsed on a preview before it is first needed, and after any change to this process.

## Dependency provenance and allowlist

- New dependency = a pull request that states: why the platform cannot do it, who maintains it,
  last release date, licence, weekly downloads, and its install scripts. Prefer actively maintained
  packages with few transitive dependencies.
- Licences allowed: MIT, Apache-2.0, BSD, ISC, 0BSD, MPL-2.0 (unmodified), CC0 and a few similar
  (`ALLOWED_LICENSES` in `scripts/lib-rules.ts`). Anything else (GPL/AGPL/SSPL/unknown) needs an ADR
  and an entry in `APPROVED_EXCEPTIONS` (see [ADR 0002](../adr/0002-licence-exceptions.md)).
- Versions come from `pnpm-lock.yaml`, installed with `--frozen-lockfile`; ranges in `package.json`
  stay caret-bounded. Install scripts of packages listed under `ignoredBuiltDependencies` in `pnpm-workspace.yaml` do not run; a new package that needs one is reviewed first.
- Dependabot (or Renovate) opens update pull requests weekly; security updates are merged within a
  week, critical ones the same day.
- Model-generated code never adds a dependency silently: the lockfile diff is reviewed like code.
