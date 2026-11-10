#!/usr/bin/env bash
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

counts() { pg_client psql -At "$1" < row-counts.sql; }

if [ -n "$into" ]; then
  shown=${into#*@}
  read -r -p "Restore saqina-$day.dump into the database at $shown? Type restore: " answer
  [ "$answer" = "restore" ] || { echo "Nothing changed."; exit 1; }
  pg_client psql -q "$into" -c 'create extension if not exists vector'
  pg_client pg_restore --no-owner --no-acl -d "$into" < "$file"
  counts "$into"
  exit 0
fi

docker run -d --name "$scratch" --network "$(pg_network)" -e POSTGRES_PASSWORD=drill pgvector/pgvector:pg17 >/dev/null
scratch_url="postgres://postgres:drill@$scratch:5432/postgres"
for _ in $(seq 1 30); do pg_client pg_isready -q -d "$scratch_url" && break; sleep 1; done
pg_client psql -q "$scratch_url" -c 'create extension if not exists vector'
pg_client pg_restore --no-owner --no-acl -d "$scratch_url" < "$file"

pg_client psql -At "$scratch_url" -c "select extname from pg_extension where extname = 'vector'"
live=$(env_value BACKUP_DATABASE_URL)
live=${live:-$(env_value DATABASE_URL)}
if diff <(counts "$live") <(counts "$scratch_url"); then
  echo "Drill passed: every table has the same row count as the live database."
else
  echo "Drill: counts differ (lines above). Rows written since the backup explain small differences." >&2
  exit 1
fi
