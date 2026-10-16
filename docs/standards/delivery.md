# Delivery: CI/CD, environments, rollback, dependencies

## Pipeline (Planned in `.github/workflows/ci.yml`; run locally until then)

```
install (frozen lockfile) → lint → typecheck → test + coverage → build → security scan → (preview deploy → smoke)
```

| Step | Command | Fails when |
|---|---|---|
| Lint | `pnpm lint` | Biome errors (formatting, imports, correctness) |
| Types | `pnpm typecheck` | any TypeScript error |
| Tests | `pnpm test` (with coverage) | a test fails or coverage drops below the ratchet |
| Build | `pnpm build` | the production build fails |
| Static analysis | Semgrep OSS ruleset | a high-severity finding |
| Dependencies | `pnpm audit --prod` + licence check | a high/critical advisory or a disallowed licence |
| Secrets | gitleaks | a secret-like string in the diff or history |

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
3. Promote the deployment; run `pnpm smoke https://<domain>`; check `/api/health`.

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
- Licences allowed: MIT, Apache-2.0, BSD, ISC, 0BSD, MPL-2.0 (unmodified), CC0. Anything else
  (GPL/AGPL/SSPL/unknown) needs an ADR.
- Versions come from `pnpm-lock.yaml`, installed with `--frozen-lockfile`; ranges in `package.json`
  stay caret-bounded. Only packages in `pnpm-workspace.yaml`'s `onlyBuiltDependencies` may run install scripts.
- Dependabot (or Renovate) opens update pull requests weekly; security updates are merged within a
  week, critical ones the same day.
- Model-generated code never adds a dependency silently: the lockfile diff is reviewed like code.
