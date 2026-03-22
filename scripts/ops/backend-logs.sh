#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source .ops.env

cd "$ZEN_BACKEND_DIR"
heroku logs -a "$ZEN_HEROKU_APP" -n "${1:-200}"