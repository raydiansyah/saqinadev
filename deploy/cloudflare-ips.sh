#!/usr/bin/env bash
# Writes cloudflare-ips.caddy (Caddy's trusted proxies) from Cloudflare's published ranges.
# With --ufw it also prints the firewall rules that open 80 and 443 to those ranges only.
# Run it in /opt/saqina when setting up, and again if Cloudflare announces new ranges.
set -euo pipefail
cd "$(dirname "$0")"

ranges=$(curl -fsS https://www.cloudflare.com/ips-v4; echo; curl -fsS https://www.cloudflare.com/ips-v6)
ranges=$(printf '%s\n' "$ranges" | sed '/^$/d')
[ "$(printf '%s\n' "$ranges" | wc -l)" -ge 10 ] || { echo "Too few Cloudflare ranges; not writing" >&2; exit 1; }

printf 'trusted_proxies static %s\n' "$(printf '%s\n' "$ranges" | tr '\n' ' ' | sed 's/ $//')" > cloudflare-ips.caddy
echo "Wrote cloudflare-ips.caddy ($(printf '%s\n' "$ranges" | wc -l) ranges)"

if [ "${1:-}" = "--ufw" ]; then
  printf '%s\n' "$ranges" | while read -r range; do
    echo "ufw allow proto tcp from $range to any port 80,443"
  done
fi
