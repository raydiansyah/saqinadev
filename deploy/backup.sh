#!/usr/bin/env bash
# shellcheck disable=SC2016 # "$PGURL" in pg_run scripts expands in the container, on purpose.
# Nightly backup (saqina-backup.timer): pg_dump of the database to R2 as saqina-<date>.dump.
# The dump passes through a temporary file, which is removed whatever happens; the disk is 20 GB.
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
. ./lib.sh

url=$(env_value BACKUP_DATABASE_URL)
url=${url:-$(env_value DATABASE_URL)}
[ -n "$url" ] || { echo "No BACKUP_DATABASE_URL or DATABASE_URL in .env" >&2; exit 1; }
case "$url" in *-pooler.*) echo "Use the direct database URL, not the pooler" >&2; exit 1 ;; esac

free_mb=$(df --output=avail -BM "${TMPDIR:-/tmp}" | tail -1 | tr -dc '0-9')
[ "$free_mb" -ge 1024 ] || { echo "Less than 1 GB free for the dump" >&2; exit 1; }

file=$(mktemp "${TMPDIR:-/tmp}/saqina-dump.XXXXXX")
trap 'rm -f "$file"' EXIT

name="saqina-$(date -u +%F).dump"
PGURL=$url pg_run 'pg_dump -Fc --no-owner --no-acl "$PGURL"' > "$file"
r2_curl -T "$file" "$(r2_url "$name")"
echo "Backed up $(du -h "$file" | cut -f1) to $name"
