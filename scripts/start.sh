#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SAICLE_HOME="${SAICLE_HOME:-$SCRIPT_DIR}"
NODE_BIN="${SAICLE_NODE_PATH:-node}"

exec "$NODE_BIN" "$SCRIPT_DIR/saicle-ui/server.cjs" --no-open "$@"
