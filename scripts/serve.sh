#!/usr/bin/env bash
# Launch `next dev` / `next start` with a SAFE bind address.
#
#   bash scripts/serve.sh dev|start [extra next args]
#
# Default: binds 127.0.0.1 and exports IC_BIND_HOST=127.0.0.1. The server only
# honours PayPal / LLM credentials when IC_BIND_HOST is a loopback address
# (src/lib/config.ts), so a credential-bearing server is never reachable from
# the network through the supported launch path.
#
# Public demo hosting (e.g. Render): PUBLIC_DEMO=true binds 0.0.0.0 and REQUIRES
# DEMO_MODE=true; the app then ignores all credentials (IC_BIND_HOST=0.0.0.0).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cmd="${1:-}"
if [[ "$cmd" != "dev" && "$cmd" != "start" ]]; then
  echo "usage: scripts/serve.sh dev|start [next args]" >&2
  exit 2
fi
shift

for arg in "$@"; do
  case "$arg" in
    -H|--hostname|-H=*|--hostname=*)
      echo "serve.sh: do not pass -H/--hostname; the bind address is chosen here (see PUBLIC_DEMO)." >&2
      exit 2
      ;;
  esac
done

if [[ "${PUBLIC_DEMO:-}" == "true" ]]; then
  if [[ "${DEMO_MODE:-}" != "true" ]]; then
    echo "serve.sh: PUBLIC_DEMO=true requires DEMO_MODE=true (public hosting is zero-key demo only)." >&2
    exit 1
  fi
  host="0.0.0.0"
  echo "serve.sh: PUBLIC demo bind ${host} — credentials are ignored (DEMO_MODE=true)." >&2
else
  host="127.0.0.1"
fi

export IC_BIND_HOST="$host"
exec bash "$ROOT/scripts/with-swc-fallback.sh" next "$cmd" -H "$host" "$@"
