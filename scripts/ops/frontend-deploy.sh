#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source .ops.env

cd "$ZEN_FRONTEND_DIR"
vercel --prod