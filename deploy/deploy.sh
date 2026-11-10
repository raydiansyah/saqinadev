#!/usr/bin/env bash
# Deploys one image tag (a commit id from image.yml) in /opt/saqina, and rolls back if it is unhealthy.
#
#   ./deploy.sh <tag>                     pull, migrate, start, wait for /api/health to report <tag>
#   DEPLOY_SKIP_PULL=1 ./deploy.sh <tag>  use an image already on this machine (built here by hand)
#
# Migrations only add (docs/standards/delivery.md), so the previous image keeps working after them,
# which is what makes the automatic rollback safe.
set -euo pipefail
cd "$(dirname "$0")"

tag=${1:?usage: deploy.sh <tag>}
min_free_gb=${MIN_FREE_GB:-3}
image=ghcr.io/raydiansyah/saqinadev

free_gb=$(df --output=avail -B1G . | tail -1 | tr -d ' ')
if [ "$free_gb" -lt "$min_free_gb" ]; then
  echo "Only ${free_gb} GB free, ${min_free_gb} GB needed. Nothing changed." >&2
  exit 1
fi

# The local database runs only when .env points the app at it.
if grep -q '^DATABASE_URL=.*@postgres:' .env; then export COMPOSE_PROFILES=localdb; fi

previous=$(cat CURRENT 2>/dev/null || true)
export SAQINA_TAG=$tag

if [ "${DEPLOY_SKIP_PULL:-}" != "1" ]; then
  echo "Pulling $image:$tag"
  docker compose pull --quiet web scheduler
fi

echo "Applying migrations"
docker compose run --rm --no-deps web sh -c 'DATABASE_URL="${MIGRATE_DATABASE_URL:-$DATABASE_URL}" node migrate.mjs'

echo "Starting $tag"
docker compose up -d --remove-orphans

health_commit() {
  docker compose exec -T web node -e \
    "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(b=>console.log(b.status+' '+b.commit)).catch(()=>console.log('down'))" \
    2>/dev/null || echo down
}

want="ok ${tag:0:7}"
for _ in $(seq 1 30); do
  if [ "$(health_commit)" = "$want" ]; then
    [ -n "$previous" ] && [ "$previous" != "$tag" ] && echo "$previous" > PREVIOUS
    echo "$tag" > CURRENT
    echo "Healthy: $tag"
    # Keep this tag and the one before it; the disk is small.
    keep=$(cat PREVIOUS 2>/dev/null || true)
    docker image ls "$image" --format '{{.Tag}}' | while read -r t; do
      if [ "$t" != "$tag" ] && [ "$t" != "$keep" ]; then docker image rm "$image:$t" >/dev/null 2>&1 || true; fi
    done
    exit 0
  fi
  sleep 3
done

echo "$tag did not report healthy within 90 s." >&2
if [ -n "$previous" ] && [ "$previous" != "$tag" ]; then
  echo "Rolling back to $previous" >&2
  SAQINA_TAG=$previous docker compose up -d --remove-orphans
fi
exit 1
