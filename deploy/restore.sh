#!/usr/bin/env bash
# shellcheck disable=SC2016 # "$PGURL" in pg_run scripts expands in the container, on purpose.
# Restores a backup from R2.
#
#   ./restore.sh <YYYY-MM-DD>               drill: restore into a throwaway database and compare the
#                                           row counts with the live one (changes nothing)
#   ./restore.sh <YYYY-MM-DD> --into <url>  real restore into an EMPTY database at <url>; asks first
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
. ./lib.sh

day=${1:?usage: restore.sh <YYYY-MM-DD> [--into <url>]}
into=""
[ "${2:-}" = "--into" ] && into=${3:?--into needs a database URL}

file=$(mktemp "${TMPDIR:-/tmp}/saqina-restore.XXXXXX")
scratch="saqina-restore-$$"
trap 'rm -f "$file"; docker rm -f "$scratch" >/dev/null 2>&1 || true' EXIT

r2_curl -o "$file" "$(r2_url "saqina-$day.dump")"
echo "Downloaded saqina-$day.dump ($(du -h "$file" | cut -f1))"

# Exact row counts of $1; fails (and stops the script) if the query fails or returns nothing.
counts() {
  local out
  out=$(PGURL=$1 pg_run 'psql -v ON_ERROR_STOP=1 -At "$PGURL"' < row-counts.sql)
  [ -n "$out" ] || { echo "No row counts from a database" >&2; return 1; }
  printf '%s\n' "$out"
}

restore_into() {
  PGURL=$1 pg_run 'psql -v ON_ERROR_STOP=1 -q "$PGURL" -c "create extension if not exists vector"'
  PGURL=$1 pg_run 'pg_restore --no-owner --no-acl -d "$PGURL"' < "$file"
}

if [ -n "$into" ]; then
  read -r -p "Restore saqina-$day.dump into the database at ${into#*@}? Type restore: " answer
  [ "$answer" = "restore" ] || { echo "Nothing changed."; exit 1; }
  restore_into "$into"
  counts "$into"
  exit 0
fi

docker run -d --name "$scratch" --network "$(pg_network)" -e POSTGRES_PASSWORD=drill pgvector/pgvector:pg17 >/dev/null
scratch_url="postgres://postgres:drill@$scratch:5432/postgres"
for _ in $(seq 1 30); do PGURL=$scratch_url pg_run 'pg_isready -q -d "$PGURL"' && break; sleep 1; done
restore_into "$scratch_url"

vector=$(PGURL=$scratch_url pg_run "psql -At \"\$PGURL\" -c \"select extname from pg_extension where extname = 'vector'\"")
[ "$vector" = "vector" ] || { echo "Drill failed: the vector extension is missing after the restore" >&2; exit 1; }

live=$(env_value BACKUP_DATABASE_URL)
live=${live:-$(env_value DATABASE_URL)}
restored=$(counts "$scratch_url")
current=$(counts "$live")
if [ "$current" = "$restored" ]; then
  echo "Drill passed: vector is installed and every table has the same row count as the live database."
else
  diff <(printf '%s\n' "$current") <(printf '%s\n' "$restored") || true
  echo "Drill: counts differ (lines above). Rows written since the backup explain small differences." >&2
  exit 1
fi
