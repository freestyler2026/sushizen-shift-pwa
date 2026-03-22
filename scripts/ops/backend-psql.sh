#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source .ops.env

cd "$ZEN_BACKEND_DIR"
heroku pg:psql -a "$ZEN_HEROKU_APP"