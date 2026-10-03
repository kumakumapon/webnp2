#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo 'Error: Install Node.js 22.12 or later (with npm): https://nodejs.org/' >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "${SCRIPT_DIR}/scripts/start-local.mjs" "$@"
