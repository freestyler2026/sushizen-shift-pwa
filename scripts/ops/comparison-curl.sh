#!/usr/bin/env bash
set -euo pipefail

CITY="${1:-Dubai}"
DATE_FROM="${2:-2026-02-19}"
DATE_TO="${3:-2026-02-25}"
LIMIT="${4:-5000}"

cd "$(dirname "$0")/../.."
source .ops.env

APPROVER_ENC=$(python -c 'import urllib.parse,os; print(urllib.parse.quote(os.environ["ZEN_APPROVER"]))')

curl -i "$ZEN_API_BASE/api/admin/attendance/comparison?city=${CITY}&date_from=${DATE_FROM}&date_to=${DATE_TO}&limit=${LIMIT}&approver_name=${APPROVER_ENC}&pin=${ZEN_PIN}"