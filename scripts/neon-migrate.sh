#!/usr/bin/env bash
#
# Applies the pending database migrations to a Neon database, using the Neon CLI to fetch the
# connection string. Nothing is written to disk: the URL (it contains the password) only lives
# in this script's memory and in the environment of the one migration process.
#
#   pnpm db:migrate:neon                       # prompts before it touches anything
#   pnpm db:migrate:neon --dry-run             # shows the plan, connects to nothing
#   pnpm db:migrate:neon --yes --backup        # no prompt, snapshot branch first
#
# Configuration (environment variables, or a .env.neon file next to package.json, git-ignored):
#   NEON_PROJECT_ID   required. Find it with `neonctl projects list`.
#   NEON_BRANCH       optional. Defaults to the project's default (production) branch.
#   NEON_DATABASE     optional. Defaults to neondb.
#   NEON_ROLE         optional. Defaults to the branch's default role.
#   NEON_API_KEY      optional. Otherwise `neonctl auth` (browser login) is used.
#
# Needs: neonctl (npm i -g neonctl) and the project's dependencies (pnpm install).

set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=0
ASSUME_YES=0
BACKUP=0
for arg in "$@"; do
  case "$arg" in
    --) ;; # pnpm forwards the separator when it is written (pnpm db:migrate:neon -- --dry-run)
    --dry-run) DRY_RUN=1 ;;
    --yes | -y) ASSUME_YES=1 ;;
    --backup) BACKUP=1 ;;
    -h | --help)
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

# Optional local config: plain KEY=value lines for the NEON_* settings above. A variable that is
# already set in the environment wins over the file. The file is read, never executed.
if [ -f .env.neon ]; then
  while IFS='=' read -r key value || [ -n "$key" ]; do
    case "$key" in
      NEON_PROJECT_ID | NEON_BRANCH | NEON_DATABASE | NEON_ROLE | NEON_API_KEY)
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        [ -n "${!key:-}" ] || export "$key=$value"
        ;;
    esac
  done <.env.neon
fi

fail() {
  echo "neon-migrate: $1" >&2
  exit 1
}

command -v neonctl >/dev/null 2>&1 || fail "neonctl is not installed. Run: npm i -g neonctl"
[ -x node_modules/.bin/tsx ] || fail "dependencies are missing. Run: pnpm install"
[ -n "${NEON_PROJECT_ID:-}" ] || fail "set NEON_PROJECT_ID (see: neonctl projects list)"

DATABASE_NAME="${NEON_DATABASE:-neondb}"
conn_args=(--project-id "$NEON_PROJECT_ID" --database-name "$DATABASE_NAME")
[ -n "${NEON_ROLE:-}" ] && conn_args+=(--role-name "$NEON_ROLE")
BRANCH_ARG=()
[ -n "${NEON_BRANCH:-}" ] && BRANCH_ARG=("$NEON_BRANCH")

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run: would fetch the DIRECT (non-pooled) connection string with neonctl,"
  echo "  project  : $NEON_PROJECT_ID"
  echo "  branch   : ${NEON_BRANCH:-<default branch>}"
  echo "  database : $DATABASE_NAME"
  [ "$BACKUP" -eq 1 ] && echo "  backup   : a snapshot branch would be created first"
  echo "then apply the migrations in src/lib/db/migrations. Nothing was changed."
  exit 0
fi

# Direct connection: migrations take locks and use DDL, which the pooler must not sit in front of.
# (An empty array needs the ${arr[@]+...} form under `set -u` on the bash 3.2 that macOS ships.)
URL="$(neonctl connection-string ${BRANCH_ARG[@]+"${BRANCH_ARG[@]}"} "${conn_args[@]}" 2>/dev/null)" ||
  fail "could not get a connection string. Run: neonctl auth (or set NEON_API_KEY)"
[ -n "$URL" ] || fail "neonctl returned an empty connection string"

# Verify the certificate fully (also silences the pg 'sslmode=require' deprecation warning).
URL="${URL/sslmode=require/sslmode=verify-full}"

HOST="$(printf '%s' "$URL" | sed -E 's#^[a-z]+://[^@]*@([^/:?]+).*#\1#')"
DB="$(printf '%s' "$URL" | sed -E 's#^[a-z]+://[^/]+/([^?]+).*#\1#')"
case "$HOST" in
  localhost | 127.* | ::1) fail "refusing: that connection points at $HOST, not at Neon" ;;
esac
case "$HOST" in
  *.neon.tech) ;;
  *) fail "refusing: $HOST is not a neon.tech host" ;;
esac
case "$HOST" in
  *-pooler*) fail "got a pooled connection ($HOST); migrations need the direct one" ;;
esac

echo "Target  : $HOST / $DB  (project $NEON_PROJECT_ID, branch ${NEON_BRANCH:-default})"

if [ "$ASSUME_YES" -ne 1 ]; then
  # A command run without a terminal (a tool, CI, `!` in an editor) cannot be asked anything.
  [ -t 0 ] || fail "no terminal to ask for confirmation. Run it in a terminal, or add --yes"
  printf 'Apply pending migrations to this database? Type "yes" to continue: '
  read -r answer || answer=""
  [ "$answer" = "yes" ] || fail "cancelled, nothing was changed"
fi

if [ "$BACKUP" -eq 1 ]; then
  BACKUP_NAME="pre-migrate-$(date +%Y%m%d-%H%M%S)"
  echo "Creating snapshot branch $BACKUP_NAME (restore point; delete it when you are done)..."
  neonctl branches create --project-id "$NEON_PROJECT_ID" --name "$BACKUP_NAME" >/dev/null ||
    fail "could not create the backup branch; migrations were NOT applied"
fi

# The URL is handed to this one process through its environment and nowhere else.
DATABASE_URL="$URL" ./node_modules/.bin/tsx scripts/migrate.ts
echo "Done. Check the app: pnpm smoke https://www.saqina.dev"
