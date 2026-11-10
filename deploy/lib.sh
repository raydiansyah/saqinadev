#!/usr/bin/env bash
# shellcheck disable=SC2016 # pg_run scripts use "$PGURL" on purpose: it expands in the container.
# Shared by backup.sh and restore.sh. Reads single values from .env without running it as shell code.
env_value() { grep -m1 "^$1=" .env | cut -d= -f2- || true; }

# The network the app runs on, so a dump of the local database (host "postgres") resolves.
pg_network() { docker network ls --format '{{.Name}}' | grep -m1 '^saqina_default$' || echo bridge; }

# Runs a Postgres 17 client command ($1, a sh script that uses "$PGURL") against the URL in $PGURL.
# The password is taken out of the URL and passed as PGPASSWORD in the environment: processes in a
# container show in the host's `ps`, so nothing on a command line may carry it.
pg_run() {
  local url=$PGURL scheme rest cred pass=""
  scheme=${url%%://*}
  rest=${url#*://}
  cred=${rest%%@*}
  if [ "$cred" != "$rest" ] && [ "${cred#*:}" != "$cred" ]; then
    pass=$(printf '%s' "${cred#*:}" | sed 's/%\([0-9A-Fa-f][0-9A-Fa-f]\)/\\x\1/g')
    pass=$(printf '%b' "$pass")
    url="$scheme://${cred%%:*}@${rest#*@}"
  fi
  PGURL=$url PGPASSWORD=$pass docker run --rm -i -e PGURL -e PGPASSWORD --network "$(pg_network)" \
    pgvector/pgvector:pg17 sh -c "$1"
}

# curl to R2 with SigV4. The key and secret go in a config read from a pipe (printf is a shell builtin),
# not on curl's command line.
r2_curl() {
  curl --fail -sS --aws-sigv4 "aws:amz:auto:s3" \
    --config <(printf 'user = "%s:%s"\n' "$(env_value BACKUP_R2_KEY)" "$(env_value BACKUP_R2_SECRET)") "$@"
}

r2_url() { echo "$(env_value BACKUP_R2_ENDPOINT)/$(env_value BACKUP_R2_BUCKET)/$1"; }
