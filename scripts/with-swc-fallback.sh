#!/usr/bin/env bash
# Run a Next.js command, falling back to @next/swc-wasm-nodejs when the
# native linux-x64-gnu binding SIGBUS/segfaults (seen on some sandboxed hosts).
# On normal machines the probe succeeds and native SWC is left untouched.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NATIVE="$ROOT/node_modules/@next/swc-linux-x64-gnu/next-swc.linux-x64-gnu.node"
MOVED=0

cleanup() {
  if [[ "$MOVED" -eq 1 && -f "${NATIVE}.broken" ]]; then
    mv "${NATIVE}.broken" "$NATIVE" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [[ -f "$NATIVE" ]]; then
  set +e
  timeout 8 node --input-type=commonjs <<'NODE'
const path = require("path");
const fs = require("fs");
const binding = path.join(
  process.cwd(),
  "node_modules/@next/swc-linux-x64-gnu/next-swc.linux-x64-gnu.node"
);
if (!fs.existsSync(binding)) process.exit(0);
const mod = { exports: {} };
process.dlopen(mod, binding);
NODE
  rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    echo "Native SWC unavailable (probe rc=$rc) — using WASM fallback" >&2
    mv "$NATIVE" "${NATIVE}.broken"
    MOVED=1
    if [[ ! -d "$ROOT/node_modules/@next/swc-wasm-nodejs" ]]; then
      npm install --no-save @next/swc-wasm-nodejs@15.5.29 >/dev/null 2>&1 || true
    fi
  fi
fi

npx "$@"
