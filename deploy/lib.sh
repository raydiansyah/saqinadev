#!/usr/bin/env bash
# Shared by backup.sh and restore.sh. Reads single values from .env without running it as shell code.
env_value() { grep -m1 "^$1=" .env | cut -d= -f2- || true; }

# The network the app runs on, so a dump of the local database (host "postgres") resolves.
pg_network() { docker network ls --format '{{.Name}}' | grep -m1 '^saqina_default$' || echo bridge; }

pg_client() { docker run --rm -i --network "$(pg_network)" pgvector/pgvector:pg17 "$@"; }

r2_curl() {
  curl --fail -sS --aws-sigv4 "aws:amz:auto:s3" --user "$(env_value BACKUP_R2_KEY):$(env_value BACKUP_R2_SECRET)" "$@"
}

r2_url() { echo "$(env_value BACKUP_R2_ENDPOINT)/$(env_value BACKUP_R2_BUCKET)/$1"; }
